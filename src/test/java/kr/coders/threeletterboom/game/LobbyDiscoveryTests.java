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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class LobbyDiscoveryTests {
    final JsonMapper json = JsonMapper.builder().build();
    final RoomService service = new RoomService(json, mock(WordDictionary.class));
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
        var body = new java.util.LinkedHashMap<String, Object>(fields);
        body.putIfAbsent("nickname", "별빛탐험가"); body.putIfAbsent("playerId", "guest-" + peer.id);
        service.handle(peer.session, json.writeValueAsString(body));
    }
    @SuppressWarnings("unchecked")
    Map<String, GameRoom> rooms() { return (Map<String, GameRoom>) ReflectionTestUtils.getField(service, "rooms"); }

    @Test void inviteOnlyRoomsStayOutOfDiscoveryButCodesAndProtectedResumeWork() throws Exception {
        Peer host = peer("invite-host"), guest = peer("invited"), returning = peer("returning");
        send(host, Map.of("type", "create", "inviteOnly", true, "protocolVersion", 2));
        String code = host.last("joined").get("roomCode").asText();
        String token = host.last("joined").get("resumeToken").asText();
        assertTrue(host.last("state").get("inviteOnly").asBoolean());
        assertTrue(service.lobbyRooms().isEmpty());
        send(guest, Map.of("type", "join", "code", code));
        assertEquals(code, guest.last("joined").get("roomCode").asText());
        service.disconnected(host.session);
        send(returning, Map.of("type", "join", "code", code, "playerId", "guest-invite-host", "protocolVersion", 2, "resumeToken", token));
        assertTrue(returning.last("state").get("inviteOnly").asBoolean());
        assertEquals(2, returning.last("state").get("players").size());
        assertTrue(service.lobbyRooms().isEmpty());
    }

    @Test void legacyCreateRemainsPublicAndSeatCountsIncludeBotsAndDisconnectedReservations() throws Exception {
        Peer host = peer("legacy"), guest = peer("reserved");
        send(host, Map.of("type", "create", "difficulty", "advanced"));
        assertFalse(host.last("state").get("inviteOnly").asBoolean());
        String code = host.last("joined").get("roomCode").asText();
        send(guest, Map.of("type", "join", "code", code));
        send(host, Map.of("type", "addBot"));
        service.disconnected(guest.session);
        var room = service.lobbyRooms().get(0);
        assertEquals(2, room.get("players")); assertEquals(1, room.get("bots"));
        assertEquals(3, room.get("occupiedSeats")); assertEquals(5, room.get("availableSeats"));
        assertEquals(1, room.get("connectedPlayers")); assertEquals("advanced", room.get("difficulty"));
    }

    @Test void modeFilteringRunsBeforeTheTwelveRoomLimit() throws Exception {
        for (int i = 0; i < 13; i++) send(peer("classic-" + i), Map.of("type", "create", "mode", "classic"));
        Peer speed = peer("speed"); send(speed, Map.of("type", "create", "mode", "speed"));
        assertEquals(12, service.lobbyRooms().size());
        assertEquals(1, service.lobbyRooms("speed").size());
        assertEquals(speed.last("joined").get("roomCode").asText(), service.lobbyRooms("speed").get(0).get("code"));
        assertTrue(service.lobbyRooms("relay").isEmpty());
        assertTrue(service.lobbyRooms("unknown").isEmpty());
        assertEquals(12, service.lobbyRooms("all").size());
    }

    @Test void quickJoinSkipsInviteOnlyAndRoomsWithoutAConnectedHuman() throws Exception {
        Peer invite = peer("hidden"), absent = peer("absent"), matching = peer("matching");
        send(invite, Map.of("type", "create", "inviteOnly", true));
        send(absent, Map.of("type", "create"));
        service.disconnected(absent.session);
        send(matching, Map.of("type", "quickJoin", "inviteOnly", true));
        String assigned = matching.last("joined").get("roomCode").asText();
        assertNotEquals(invite.last("joined").get("roomCode").asText(), assigned);
        assertNotEquals(absent.last("joined").get("roomCode").asText(), assigned);
        assertFalse(matching.last("state").get("inviteOnly").asBoolean(), "quick matching always creates a public room");
    }

    @Test void simultaneousQuickJoinsCannotOverfillTheLastSeat() throws Exception {
        Peer host = peer("host"); send(host, Map.of("type", "create"));
        String code = host.last("joined").get("roomCode").asText();
        for (int i = 0; i < 6; i++) send(peer("seat-" + i), Map.of("type", "join", "code", code));
        Peer first = peer("racer-one"), second = peer("racer-two");
        var gate = new CountDownLatch(1); var executor = Executors.newFixedThreadPool(2);
        try {
            var futures = List.of(first, second).stream().map(p -> executor.submit(() -> {
                gate.await(); send(p, Map.of("type", "quickJoin")); return true;
            })).toList();
            gate.countDown(); for (var future : futures) assertTrue(future.get(5, TimeUnit.SECONDS));
            String one = first.last("joined").get("roomCode").asText(), two = second.last("joined").get("roomCode").asText();
            assertNotEquals(one, two); assertTrue(code.equals(one) || code.equals(two));
            assertEquals(8, rooms().get(code).players.size());
        } finally { executor.shutdownNow(); }
    }

    record Peer(String id, WebSocketSession session, List<JsonNode> messages) {
        JsonNode last(String type) {
            synchronized (messages) {
                return messages.stream().filter(m -> type.equals(m.path("type").asText())).reduce((a, b) -> b).orElseThrow();
            }
        }
    }
}
