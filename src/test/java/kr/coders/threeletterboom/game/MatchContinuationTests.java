package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MatchContinuationTests {
    final JsonMapper json = JsonMapper.builder().build();
    final WordDictionary dictionary = mock(WordDictionary.class);
    final RoomService service = new RoomService(json, dictionary);

    @BeforeEach void dictionary() { when(dictionary.pickStarter(any())).thenReturn("자"); }
    @AfterEach void close() { service.shutdown(); }

    Peer peer(String id) throws Exception {
        var session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        when(session.getHandshakeHeaders()).thenReturn(new HttpHeaders());
        var peer = new Peer(id, session, new ArrayList<>());
        doAnswer(call -> {
            synchronized (peer.messages) { peer.messages.add(json.readTree(((TextMessage) call.getArgument(0)).getPayload())); }
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        return peer;
    }
    void send(Peer peer, Map<String, Object> fields) {
        var body = new LinkedHashMap<String, Object>(fields);
        body.putIfAbsent("nickname", "별빛탐험가");
        body.putIfAbsent("playerId", "guest-" + peer.id);
        body.putIfAbsent("protocolVersion", 2);
        service.handle(peer.session, json.writeValueAsString(body));
    }
    @SuppressWarnings("unchecked")
    Map<String, GameRoom> rooms() { return (Map<String, GameRoom>) ReflectionTestUtils.getField(service, "rooms"); }
    GameRoom create(Peer host, boolean inviteOnly) {
        send(host, Map.of("type", "create", "inviteOnly", inviteOnly));
        return rooms().get(host.last("joined").path("roomCode").asText());
    }
    void join(Peer guest, GameRoom room) { send(guest, Map.of("type", "join", "code", room.code)); }
    void finish(GameRoom room) {
        synchronized (room) {
            room.players.values().forEach(player -> player.eliminated = !player.id.equals(room.hostId));
            ReflectionTestUtils.invokeMethod(service, "finish", room);
        }
    }

    @Test void publicRoomCanRecruitAndChangeSettingsAfterReturningWithoutLosingCrewOrWins() throws Exception {
        var host = peer("host"); var guest = peer("guest"); var returning = peer("returning"); var newcomer = peer("newcomer");
        GameRoom room = create(host, false); join(guest, room);
        String guestToken = guest.last("joined").path("resumeToken").asText();
        send(host, Map.of("type", "addBot")); send(host, Map.of("type", "start"));
        synchronized (room) {
            var hostPlayer = room.players.get("guest-host");
            var crew = room.players.values().stream().map(p -> Map.entry(p.id, p.mascot)).toList();
            int round = room.round;
            hostPlayer.score = 300; hostPlayer.wordsPlayed = 2; hostPlayer.hintsRemaining = 1;
            room.usedWords.add("자전거");
            room.history.add(new GameRoom.WordPlay(hostPlayer.id, hostPlayer.nickname, "자전거", 100, 1));
            room.combo = 3;
            service.disconnected(guest.session);
            finish(room);
            assertTrue(service.lobbyRooms().isEmpty());
            send(host, Map.of("type", "returnToLobby"));
            JsonNode waiting = host.last("state");
            assertEquals("waiting", waiting.path("phase").asText());
            assertEquals(room.code, waiting.path("roomCode").asText());
            assertEquals(round, room.round); assertEquals("", room.roundId);
            assertEquals(crew, room.players.values().stream().map(p -> Map.entry(p.id, p.mascot)).toList());
            assertEquals(1, hostPlayer.wins); assertEquals(0, hostPlayer.score); assertEquals(0, hostPlayer.wordsPlayed);
            assertEquals(3, hostPlayer.hintsRemaining); assertEquals(2, hostPlayer.lives);
            assertFalse(room.players.get("guest-guest").connected);
            assertTrue(room.players.values().stream().noneMatch(p -> p.eliminated));
            assertTrue(room.usedWords.isEmpty()); assertTrue(room.history.isEmpty());
            assertNull(room.requiredSyllable); assertNull(room.lastWord); assertNull(room.winnerId);
            assertEquals(0, room.combo); assertEquals(0, room.turnCount); assertEquals(0, room.deadline);
            assertEquals(0, room.turnStartedAt); assertEquals(0, room.botActionAt);
            assertEquals(room.code, service.lobbyRooms().get(0).get("code"));
            assertEquals(5, service.lobbyRooms().get(0).get("availableSeats"));
            send(returning, Map.of("type", "join", "code", room.code, "playerId", "guest-guest", "resumeToken", guestToken));
            assertEquals("waiting", returning.last("state").path("phase").asText());
            join(newcomer, room);
            String botId = room.players.values().stream().filter(p -> p.bot).findFirst().orElseThrow().id;
            send(host, Map.of("type", "removeBot", "botId", botId));
            send(host, Map.of("type", "setDifficulty", "difficulty", "intermediate"));
            assertEquals(GameDifficulty.INTERMEDIATE, room.difficulty);
            assertEquals(3, room.players.size());
            send(host, Map.of("type", "start"));
            assertEquals(GameRoom.Phase.PLAYING, room.phase); assertEquals(round + 1, room.round);
            assertEquals(1, hostPlayer.wins); assertEquals(1, room.turnCount);
        }
    }

    @Test void inviteOnlyRoomKeepsVisibilityAndReleasesOnlyExpiredReservations() throws Exception {
        var host = peer("host"); var guest = peer("guest"); var newcomer = peer("newcomer");
        GameRoom room = create(host, true); join(guest, room); send(host, Map.of("type", "start"));
        synchronized (room) {
            service.disconnected(guest.session);
            room.players.get("guest-guest").disconnectedAt = System.currentTimeMillis() - 31_000;
            finish(room); send(host, Map.of("type", "returnToLobby"));
            assertEquals(GameRoom.Phase.WAITING, room.phase);
            assertEquals(1, room.players.size()); assertTrue(room.inviteOnly);
            assertTrue(host.last("state").path("inviteOnly").asBoolean());
            assertTrue(service.lobbyRooms().isEmpty());
            join(newcomer, room); assertEquals(2, room.players.size());
        }
    }

    @Test void returningToLobbyRequiresHostAndFinishedRound() throws Exception {
        var host = peer("host"); var guest = peer("guest"); GameRoom room = create(host, false); join(guest, room);
        send(host, Map.of("type", "returnToLobby"));
        assertEquals("NOT_FINISHED", host.last("error").path("code").asText());
        send(host, Map.of("type", "start"));
        synchronized (room) {
            send(host, Map.of("type", "returnToLobby"));
            assertEquals("NOT_FINISHED", host.last("error").path("code").asText());
            finish(room);
            send(guest, Map.of("type", "returnToLobby"));
            assertEquals("HOST_ONLY", guest.last("error").path("code").asText());
            assertEquals(GameRoom.Phase.FINISHED, room.phase);
        }
    }

    @Test void duelCannotBecomeAPublicWaitingRoomAndImmediateRematchRemainsAvailable() throws Exception {
        var host = peer("host"); var guest = peer("guest");
        send(host, Map.of("type", "duelQueue")); send(guest, Map.of("type", "duelQueue"));
        GameRoom room = rooms().get(host.last("joined").path("roomCode").asText());
        synchronized (room) {
            int round = room.round; String roundId = room.roundId;
            finish(room); send(host, Map.of("type", "returnToLobby"));
            assertEquals("DUEL_AUTO", host.last("error").path("code").asText());
            assertEquals(GameRoom.Phase.FINISHED, room.phase);
            send(host, Map.of("type", "rematch"));
            assertEquals(GameRoom.Phase.PLAYING, room.phase); assertEquals(round + 1, room.round);
            assertNotEquals(roundId, room.roundId); assertTrue(service.lobbyRooms().isEmpty());
        }
    }

    @Test void concurrentHintRequestsChargeOnceAndResumeCanRecoverTheLastHintWithoutCharge() throws Exception {
        var host = peer("host"); var guest = peer("guest"); var returning = peer("returning");
        GameRoom room = create(host, false); join(guest, room); send(host, Map.of("type", "start"));
        String token = host.last("joined").path("resumeToken").asText();
        when(dictionary.pick(eq("자"), any(), anySet())).thenReturn("자전거");
        var player = room.players.get("guest-host");
        player.score = 500; player.hintsRemaining = 1;
        var executor = Executors.newFixedThreadPool(2); var gate = new CountDownLatch(1);
        try {
            var first = executor.submit(() -> { gate.await(); send(host, Map.of("type", "hint")); return true; });
            var second = executor.submit(() -> { gate.await(); send(host, Map.of("type", "hint")); return true; });
            gate.countDown(); assertTrue(first.get(5, TimeUnit.SECONDS)); assertTrue(second.get(5, TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
        synchronized (room) {
            var hints = host.messages.stream().filter(m -> "hint".equals(m.path("type").asText())).toList();
            assertEquals(2, hints.size());
            assertEquals(1, hints.stream().filter(m -> m.path("charged").asBoolean()).count());
            assertTrue(hints.stream().allMatch(m -> "자전거".equals(m.path("word").asText()) && m.path("remaining").asInt() == 0));
            assertTrue(hints.stream().allMatch(m -> m.path("deductedPoints").asInt(-1)
                    == (m.path("charged").asBoolean() ? m.path("cost").asInt() : 0)));
            assertEquals(0, player.hintsRemaining); assertEquals(500 - hints.get(0).path("cost").asInt(), player.score);
            verify(dictionary, times(1)).pick(eq("자"), any(), anySet());
            service.disconnected(host.session);
            send(returning, Map.of("type", "join", "code", room.code, "playerId", "guest-host", "resumeToken", token));
            send(returning, Map.of("type", "hint", "round", room.round, "turnCount", room.turnCount));
            var hint = returning.last("hint");
            assertFalse(hint.path("charged").asBoolean()); assertEquals(room.roundId, hint.path("roundId").asText());
            assertEquals(0, hint.path("deductedPoints").asInt(-1));
            assertEquals(room.round, hint.path("round").asInt()); assertEquals(room.turnCount, hint.path("turnCount").asInt());
            assertEquals("자전거", hint.path("word").asText()); assertEquals(0, hint.path("remaining").asInt());
            room.deadline = System.currentTimeMillis() - 1;
            send(returning, Map.of("type", "hint"));
            assertEquals("TURN_EXPIRED", returning.last("error").path("code").asText());
            assertEquals(0, player.hintsRemaining);
        }
    }

    @Test void laterTurnsAndRematchesGetFreshHintsWhileStaleRequestsCannotSpendThem() throws Exception {
        var host = peer("host"); var guest = peer("guest"); GameRoom room = create(host, false); join(guest, room);
        when(dictionary.pick(eq("자"), any(), anySet())).thenReturn("자전거");
        when(dictionary.pick(eq("줄"), any(), anySet())).thenReturn("줄넘기");
        when(dictionary.isKnown("자전거")).thenReturn(true); when(dictionary.isKnown("거미줄")).thenReturn(true);
        send(host, Map.of("type", "start"));
        synchronized (room) {
            send(host, Map.of("type", "hint"));
            assertEquals(0, host.last("hint").path("deductedPoints").asInt(-1));
            assertFalse(room.eventText.contains("점"));
            int firstTurn = room.turnCount; String firstRoundId = room.roundId;
            send(host, Map.of("type", "word", "word", "자전거"));
            send(guest, Map.of("type", "word", "word", "거미줄"));
            send(host, Map.of("type", "hint", "round", room.round, "turnCount", firstTurn));
            assertEquals("STALE_TURN", host.last("error").path("code").asText());
            assertEquals(2, room.players.get("guest-host").hintsRemaining);
            send(host, Map.of("type", "hint", "round", room.round, "turnCount", room.turnCount));
            assertTrue(host.last("hint").path("charged").asBoolean());
            assertEquals("줄넘기", host.last("hint").path("word").asText());
            assertEquals(1, room.players.get("guest-host").hintsRemaining);
            finish(room); send(host, Map.of("type", "rematch"));
            assertNotEquals(firstRoundId, room.roundId);
            assertNull(room.players.get("guest-host").hintSnapshot);
            send(host, Map.of("type", "hint"));
            assertTrue(host.last("hint").path("charged").asBoolean());
            assertEquals(2, host.last("hint").path("remaining").asInt());
        }
    }

    @Test void unavailableHintDoesNotConsumeAnythingAndLobbyReturnClearsCachedHints() throws Exception {
        var host = peer("host"); var guest = peer("guest"); GameRoom room = create(host, false); join(guest, room);
        send(host, Map.of("type", "start"));
        synchronized (room) {
            var player = room.players.get("guest-host"); player.score = 500;
            send(host, Map.of("type", "hint"));
            assertEquals("HINT_UNAVAILABLE", host.last("error").path("code").asText());
            assertEquals(3, player.hintsRemaining); assertEquals(500, player.score); assertNull(player.hintSnapshot);
            when(dictionary.pick(eq("자"), any(), anySet())).thenReturn("자전거");
            player.score = 10;
            send(host, Map.of("type", "hint")); assertNotNull(player.hintSnapshot);
            assertEquals(10, host.last("hint").path("deductedPoints").asInt(-1));
            assertTrue(host.last("hint").path("cost").asInt() > 10);
            assertEquals(0, player.score); assertTrue(room.eventText.endsWith("-10점"));
            finish(room); send(host, Map.of("type", "returnToLobby"));
            assertNull(player.hintSnapshot); assertEquals(3, player.hintsRemaining);
            send(host, Map.of("type", "hint"));
            assertEquals("NOT_PLAYING", host.last("error").path("code").asText());
        }
    }

    record Peer(String id, WebSocketSession session, List<JsonNode> messages) {
        JsonNode last(String type) {
            synchronized (messages) {
                return messages.stream().filter(m -> type.equals(m.path("type").asText())).reduce((a, b) -> b).orElseThrow();
            }
        }
    }
}
