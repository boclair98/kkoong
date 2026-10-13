package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ReleaseReadinessTests {
    final JsonMapper json = JsonMapper.builder().build();
    final WordDictionary dictionary = mock(WordDictionary.class);
    final RoomService service = new RoomService(json, dictionary);
    @AfterEach void close() { service.shutdown(); }

    @SuppressWarnings("unchecked")
    Map<String, GameRoom> rooms() { return (Map<String, GameRoom>) ReflectionTestUtils.getField(service, "rooms"); }
    Peer peer(String id) throws Exception {
        var session = mock(WebSocketSession.class);
        var messages = new ArrayList<JsonNode>();
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        when(session.getHandshakeHeaders()).thenReturn(new HttpHeaders());
        doAnswer(call -> { synchronized (messages) { messages.add(json.readTree(((TextMessage) call.getArgument(0)).getPayload())); } return null; })
                .when(session).sendMessage(any(TextMessage.class));
        return new Peer(session, messages);
    }
    void send(Peer peer, Map<String, Object> body) { service.handle(peer.session, json.writeValueAsString(body)); }
    GameRoom create(Peer peer, String id) {
        send(peer, Map.of("type", "create", "nickname", "별빛탐험가", "playerId", id, "protocolVersion", 2));
        return rooms().get(peer.last("joined").get("roomCode").asText());
    }
    void join(Peer peer, GameRoom room, String id, String token) {
        send(peer, Map.of("type", "join", "code", room.code, "nickname", "은하항해사", "playerId", id, "protocolVersion", 2, "resumeToken", token));
    }

    @Test void oneSocketCannotCreateGhostRoomsOrOccupyTwoRooms() throws Exception {
        var first = peer("first"); var second = peer("second");
        GameRoom one = create(first, "guest-first"); GameRoom two = create(second, "guest-second");
        send(first, Map.of("type", "create", "nickname", "별빛탐험가"));
        assertEquals("ALREADY_IN_ROOM", first.last("error").get("code").asText());
        join(first, two, "guest-first", "");
        assertEquals("ALREADY_IN_ROOM", first.last("error").get("code").asText());
        assertEquals(2, rooms().size()); assertEquals(1, one.players.size()); assertEquals(1, two.players.size());
    }

    @Test void publicIdsCannotHijackProtectedPlayersAndOldSocketsCannotAct() throws Exception {
        var original = peer("original"); var attacker = peer("attacker"); var returning = peer("returning");
        GameRoom room = create(original, "guest-protected");
        String token = original.last("joined").get("resumeToken").asText();
        assertFalse(original.last("state").toString().contains(token));
        join(attacker, room, "guest-protected", "forged");
        assertEquals("RESUME_DENIED", attacker.last("error").get("code").asText());
        // Legacy callers cannot bypass the protected-session check.
        send(attacker, Map.of("type", "join", "code", room.code, "nickname", "별빛탐험가", "playerId", "guest-protected"));
        assertEquals("RESUME_DENIED", attacker.last("error").get("code").asText());
        join(returning, room, "guest-protected", token);
        assertEquals(1, room.players.size());
        assertSame(returning.session, room.players.get("guest-protected").session);
        send(original, Map.of("type", "start"));
        assertEquals("JOIN_FIRST", original.last("error").get("code").asText());
        assertEquals(GameRoom.Phase.WAITING, room.phase);
        service.disconnected(original.session);
        assertTrue(room.players.get("guest-protected").connected);
    }

    @Test void waitingRoomReloadPreservesHostAndCharacterWithinGrace() throws Exception {
        var original = peer("original"); var returning = peer("returning");
        GameRoom room = create(original, "guest-reload");
        String token = original.last("joined").get("resumeToken").asText();
        int mascot = room.players.get("guest-reload").mascot;
        service.disconnected(original.session);
        assertTrue(rooms().containsKey(room.code)); assertEquals("guest-reload", room.hostId);
        join(returning, room, "guest-reload", token);
        assertEquals(mascot, room.players.get("guest-reload").mascot);
        assertTrue(room.players.get("guest-reload").connected);
    }

    @Test void briefDisconnectDoesNotAwardImmediateWinButClockStillRuns() throws Exception {
        var first = peer("first"); var second = peer("second");
        GameRoom room = create(first, "guest-first"); join(second, room, "guest-second", "");
        when(dictionary.pickStarter(GameMode.CLASSIC)).thenReturn("자");
        send(first, Map.of("type", "start"));
        synchronized (room) {
            service.disconnected(first.session);
            assertEquals(GameRoom.Phase.PLAYING, room.phase);
            assertNull(room.winnerId);
            long deadline = room.deadline;
            ReflectionTestUtils.invokeMethod(service, "tickGame", room, deadline);
            assertEquals(1, room.players.get("guest-first").lives);
            assertEquals(GameRoom.Phase.PLAYING, room.phase);
        }
    }

    @Test void expiredWordAndHintCannotEarnPointsOrSpendHints() throws Exception {
        var first = peer("first"); GameRoom room = create(first, "guest-first");
        when(dictionary.pickStarter(GameMode.CLASSIC)).thenReturn("자");
        send(first, Map.of("type", "start"));
        synchronized (room) {
            room.deadline = System.currentTimeMillis() - 1;
            send(first, Map.of("type", "word", "word", "자전거"));
            assertEquals("TURN_EXPIRED", first.last("error").get("code").asText());
            assertTrue(room.history.isEmpty()); assertEquals(0, room.players.get("guest-first").score);
            room.turnIndex = 0; room.deadline = System.currentTimeMillis() - 1;
            send(first, Map.of("type", "hint"));
            assertEquals("TURN_EXPIRED", first.last("error").get("code").asText());
            assertEquals(3, room.players.get("guest-first").hintsRemaining);
        }
    }

    @Test void resultCountsAllWordsBeyondTheBoundedHistoryAndCanResumeAfterFinish() throws Exception {
        var first = peer("first"); var returning = peer("returning"); GameRoom room = create(first, "guest-first");
        String token = first.last("joined").get("resumeToken").asText();
        when(dictionary.pickStarter(GameMode.CLASSIC)).thenReturn("자"); send(first, Map.of("type", "start"));
        synchronized (room) {
            for (int index = 0; index < 15; index++) ReflectionTestUtils.invokeMethod(service, "acceptWord", room, room.players.get("guest-first"), "자전거");
            @SuppressWarnings("unchecked") var state = (Map<String, Object>) ReflectionTestUtils.invokeMethod(service, "state", room);
            assertEquals(12, ((List<?>) state.get("history")).size());
            assertEquals(15, room.players.get("guest-first").wordsPlayed);
            room.players.values().stream().filter(p -> p.bot).forEach(p -> p.eliminated = true);
            ReflectionTestUtils.invokeMethod(service, "finish", room);
            service.disconnected(first.session);
            join(returning, room, "guest-first", token);
            assertEquals("finished", returning.last("state").get("phase").asText());
            assertEquals(15, returning.last("state").get("players").get(0).get("wordsPlayed").asInt());
        }
    }

    @Test void removingAnEarlierSeatDoesNotMoveAnotherPlayersTurnOrDeadline() throws Exception {
        var first = peer("first"); var second = peer("second"); var third = peer("third");
        GameRoom room = create(first, "guest-first"); join(second, room, "guest-second", ""); join(third, room, "guest-third", "");
        when(dictionary.pickStarter(GameMode.CLASSIC)).thenReturn("자"); send(first, Map.of("type", "start"));
        synchronized (room) {
            room.turnIndex = 2;
            long deadline = room.deadline;
            send(first, Map.of("type", "leave"));
            assertEquals(1, room.turnIndex); assertEquals(deadline, room.deadline);
            assertEquals("guest-third", third.last("state").get("turnPlayerId").asText());
        }
    }

    @Test void graceCleanupReleasesAnEmptyRoom() throws Exception {
        var first = peer("first"); GameRoom room = create(first, "guest-first");
        service.disconnected(first.session);
        synchronized (room) {
            ReflectionTestUtils.invokeMethod(service, "cleanDisconnected", room, System.currentTimeMillis() + 31_000);
            assertFalse(rooms().containsKey(room.code));
        }
    }

    @Test void aDelayedPreviousTurnCannotConsumeHintsOrAcceptWords() throws Exception {
        var first = peer("first"); GameRoom room = create(first, "guest-first");
        when(dictionary.pickStarter(GameMode.CLASSIC)).thenReturn("자"); send(first, Map.of("type", "start"));
        synchronized (room) {
            send(first, Map.of("type", "hint", "round", room.round - 1, "turnCount", room.turnCount));
            assertEquals("STALE_TURN", first.last("error").get("code").asText());
            send(first, Map.of("type", "word", "word", "자전거", "round", room.round, "turnCount", room.turnCount - 1));
            assertEquals("STALE_TURN", first.last("error").get("code").asText());
            assertEquals(3, room.players.get("guest-first").hintsRemaining);
            assertTrue(room.history.isEmpty());
        }
    }

    @Test void simultaneousStaleSeatsKeepTheOriginalNextPlayerOrder() throws Exception {
        var first = peer("first"); var second = peer("second"); var third = peer("third"); var fourth = peer("fourth");
        GameRoom room = create(first, "guest-first"); join(second, room, "guest-second", "");
        join(third, room, "guest-third", ""); join(fourth, room, "guest-fourth", "");
        when(dictionary.pickStarter(GameMode.CLASSIC)).thenReturn("자"); send(first, Map.of("type", "start"));
        synchronized (room) {
            room.turnIndex = 2; service.disconnected(first.session); service.disconnected(third.session);
            ReflectionTestUtils.invokeMethod(service, "cleanDisconnected", room, System.currentTimeMillis() + 31_000);
            assertEquals(2, room.players.size());
            assertEquals("guest-fourth", fourth.last("state").get("turnPlayerId").asText());
            assertTrue(room.deadline > System.currentTimeMillis());
        }
    }

    record Peer(WebSocketSession session, List<JsonNode> messages) {
        JsonNode last(String type) {
            synchronized (messages) {
                for (int i = messages.size() - 1; i >= 0; i--) if (type.equals(messages.get(i).path("type").asText())) return messages.get(i);
            }
            throw new AssertionError("No message: " + type);
        }
    }
}
