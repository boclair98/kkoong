package kr.coders.threeletterboom;

import kr.coders.threeletterboom.game.GameMode;
import kr.coders.threeletterboom.game.WordDictionary;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GameWebSocketIntegrationTests {
    @LocalServerPort
    int port;

    @Autowired
    WordDictionary dictionary;

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void rejectsUnsafeNicknameBeforeCreatingAVisibleRoom() throws Exception {
        MessageListener listener = new MessageListener();
        WebSocket socket = HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/game"), listener).get(5, TimeUnit.SECONDS);
        try {
            socket.sendText("{\"type\":\"create\",\"nickname\":\"씨1발\"}", true).join();
            assertEquals("INVALID_NICKNAME", listener.await("error", json).get("code").asText());
            socket.sendText("{\"type\":\"create\",\"nickname\":\"임의별명\"}", true).join();
            assertEquals("INVALID_NICKNAME", listener.await("error", json).get("code").asText());
        } finally {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
        }
    }

    @Test
    void publicLobbyCanBeReadFromTheSeparateMiniappOrigin() throws Exception {
        HttpResponse<String> response = HttpClient.newHttpClient().send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/lobby"))
                .header("Origin", "https://apps-in-toss.toss.im")
                .GET().build(), HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        assertEquals("*", response.headers().firstValue("access-control-allow-origin").orElse(null));
        assertTrue(json.readTree(response.body()).get("rooms").isArray());
    }

    @Test
    void duelQueueMatchesTwoPeopleAndStartsAutomaticallyWithoutAppearingInPublicRooms() throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        URI uri = URI.create("ws://localhost:" + port + "/ws/game");
        MessageListener firstMessages = new MessageListener();
        MessageListener secondMessages = new MessageListener();
        WebSocket first = client.newWebSocketBuilder().buildAsync(uri, firstMessages).get(5, TimeUnit.SECONDS);
        WebSocket second = client.newWebSocketBuilder().buildAsync(uri, secondMessages).get(5, TimeUnit.SECONDS);
        try {
            first.sendText("{\"type\":\"duelQueue\",\"mode\":\"classic\",\"nickname\":\"별빛탐험가\",\"playerId\":\"duel-first\"}", true).join();
            String code = firstMessages.await("joined", json).get("roomCode").asText();
            JsonNode waiting = firstMessages.awaitState("waiting", json);
            assertEquals("duel", waiting.get("matchType").asText());
            assertEquals(2, waiting.get("maxPlayers").asInt());
            HttpResponse<String> lobby = client.send(HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + "/api/lobby")).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            for (JsonNode room : json.readTree(lobby.body()).get("rooms")) {
                assertFalse(code.equals(room.get("code").asText()));
            }

            second.sendText("{\"type\":\"duelQueue\",\"mode\":\"classic\",\"nickname\":\"은하항해사\",\"playerId\":\"duel-second\"}", true).join();
            assertEquals(code, secondMessages.await("joined", json).get("roomCode").asText());
            JsonNode firstPlaying = firstMessages.awaitState("playing", json);
            JsonNode secondPlaying = secondMessages.awaitState("playing", json);
            assertEquals(2, firstPlaying.get("players").size());
            assertEquals(2, secondPlaying.get("players").size());
            assertNotNull(firstPlaying.get("requiredSyllable").asText());
        } finally {
            first.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
            second.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
        }
    }

    @Test
    void dictionaryCheckEndpointSeparatesKnownAndInventedWords() throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        String valid = URLEncoder.encode("자전거", StandardCharsets.UTF_8);
        String invented = URLEncoder.encode("자뷁쀍", StandardCharsets.UTF_8);
        HttpResponse<String> validResponse = client.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/word/check?word=" + valid)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        HttpResponse<String> inventedResponse = client.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/word/check?word=" + invented)).GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertEquals(200, validResponse.statusCode());
        assertTrue(json.readTree(validResponse.body()).get("known").asBoolean());
        assertFalse(json.readTree(inventedResponse.body()).get("known").asBoolean());
    }

    @Test
    void createsRoomRejectsInventedWordAndAcceptsDictionaryNoun() throws Exception {
        MessageListener listener = new MessageListener();
        WebSocket socket = HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/game"), listener).get(5, TimeUnit.SECONDS);

        socket.sendText("{\"type\":\"create\",\"mode\":\"classic\",\"nickname\":\"별빛파일럿\",\"playerId\":\"guest-test-1234\",\"mascot\":3}", true).join();
        JsonNode joined = listener.await("joined", json);
        assertEquals(5, joined.get("roomCode").asText().length());
        JsonNode waiting = listener.awaitState("waiting", json);
        assertEquals(1, waiting.get("players").size());
        assertEquals(3, waiting.get("players").get(0).get("mascot").asInt());
        assertEquals(7, waiting.get("feverTarget").asInt());

        socket.sendText("{\"type\":\"start\"}", true).join();
        JsonNode playing = listener.awaitState("playing", json);
        assertEquals(2, playing.get("players").size());
        assertNotNull(playing.get("requiredSyllable").asText());
        assertTrue(playing.get("deadline").asLong() > System.currentTimeMillis());

        if (playing.get("turnPlayerId").asText().equals(joined.get("playerId").asText())) {
            assertEquals(3, playing.get("players").get(0).get("hints").asInt());
            socket.sendText("{\"type\":\"hint\"}", true).join();
            JsonNode hint = listener.await("hint", json);
            assertTrue(dictionary.isKnown(hint.get("word").asText()));
            assertEquals(2, hint.get("remaining").asInt());

            String first = playing.get("requiredSyllable").asText();
            socket.sendText("{\"type\":\"word\",\"word\":\"" + first + "나\"}", true).join();
            JsonNode error = listener.await("error", json);
            assertEquals("WRONG_LENGTH", error.get("code").asText());

            socket.sendText("{\"type\":\"word\",\"word\":\"" + first + "뷁쀍\"}", true).join();
            JsonNode invented = listener.await("error", json);
            assertEquals("NOT_IN_DICTIONARY", invented.get("code").asText());

            String known = dictionary.pick(first, GameMode.CLASSIC, new HashSet<>());
            assertNotNull(known);
            socket.sendText("{\"type\":\"word\",\"word\":\"" + known + "\"}", true).join();
            JsonNode accepted = listener.awaitStateEvent("사전 인증", json);
            assertEquals(known, accepted.get("history").get(0).get("word").asText());
            assertEquals(joined.get("playerId").asText(), accepted.get("history").get(0).get("playerId").asText());
        }
        socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
    }

    @Test
    void sharesCrewChoiceWithOtherPlayersAndBoundsInvalidChoices() throws Exception {
        MessageListener hostMessages = new MessageListener();
        MessageListener guestMessages = new MessageListener();
        HttpClient client = HttpClient.newHttpClient();
        URI uri = URI.create("ws://localhost:" + port + "/ws/game");
        WebSocket host = client.newWebSocketBuilder().buildAsync(uri, hostMessages).get(5, TimeUnit.SECONDS);
        WebSocket guest = client.newWebSocketBuilder().buildAsync(uri, guestMessages).get(5, TimeUnit.SECONDS);
        try {
            host.sendText("{\"type\":\"create\",\"nickname\":\"별빛탐험가\",\"mascot\":1}", true).join();
            String code = hostMessages.await("joined", json).get("roomCode").asText();
            hostMessages.awaitState("waiting", json);
            guest.sendText("{\"type\":\"join\",\"code\":\"" + code + "\",\"nickname\":\"은하항해사\",\"mascot\":999}", true).join();
            guestMessages.await("joined", json);
            JsonNode guestState = guestMessages.awaitState("waiting", json);
            JsonNode hostState = hostMessages.awaitState("waiting", json);
            assertEquals(2, hostState.get("players").size());
            assertEquals(1, guestState.get("players").get(0).get("mascot").asInt());
            int fallback = guestState.get("players").get(1).get("mascot").asInt();
            assertTrue(fallback >= 0 && fallback < 24);
            assertEquals(fallback, hostState.get("players").get(1).get("mascot").asInt());
        } finally {
            host.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
            guest.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
        }
    }

    @Test
    void eightPeopleHaveUniqueCharactersAndReconnectKeepsTheAssignedOne() throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        URI uri = URI.create("ws://localhost:" + port + "/ws/game");
        var sockets = new ArrayList<WebSocket>();
        try {
            MessageListener hostMessages = new MessageListener();
            WebSocket host = client.newWebSocketBuilder().buildAsync(uri, hostMessages).get(5, TimeUnit.SECONDS);
            sockets.add(host);
            host.sendText("{\"type\":\"create\",\"playerId\":\"guest-roster-host\",\"nickname\":\"달빛탐험가\",\"mascot\":23}", true).join();
            JsonNode joined = hostMessages.await("joined", json);
            String code = joined.get("roomCode").asText();
            assertEquals(23, joined.get("mascot").asInt());
            hostMessages.awaitState("waiting", json);
            int lastAssigned = -1;
            JsonNode state = null;
            for (int i = 1; i < 8; i++) {
                MessageListener messages = new MessageListener();
                WebSocket guest = client.newWebSocketBuilder().buildAsync(uri, messages).get(5, TimeUnit.SECONDS);
                sockets.add(guest);
                guest.sendText("{\"type\":\"join\",\"code\":\"" + code + "\",\"playerId\":\"guest-roster-" + i
                        + "\",\"nickname\":\"" + List.of("별빛탐험가", "별빛항해사", "별빛파일럿", "별빛연구원",
                                "은하탐험가", "은하항해사", "은하파일럿").get(i - 1) + "\",\"mascot\":23}", true).join();
                JsonNode guestJoined = messages.await("joined", json);
                lastAssigned = guestJoined.get("mascot").asInt();
                assertTrue(guestJoined.get("mascotAdjusted").asBoolean());
                state = messages.awaitState("waiting", json);
                assertEquals(i + 1, state.get("players").size());
            }
            var unique = new HashSet<Integer>();
            for (JsonNode player : state.get("players")) {
                assertTrue(unique.add(player.get("mascot").asInt()));
                assertTrue(player.get("mascot").asInt() >= 0 && player.get("mascot").asInt() < 24);
            }
            MessageListener reconnectMessages = new MessageListener();
            WebSocket reconnect = client.newWebSocketBuilder().buildAsync(uri, reconnectMessages).get(5, TimeUnit.SECONDS);
            sockets.add(reconnect);
            reconnect.sendText("{\"type\":\"join\",\"code\":\"" + code
                    + "\",\"playerId\":\"guest-roster-7\",\"nickname\":\"은하파일럿\",\"mascot\":23}", true).join();
            assertEquals(lastAssigned, reconnectMessages.await("joined", json).get("mascot").asInt());
            assertEquals(8, reconnectMessages.awaitState("waiting", json).get("players").size());
        } finally {
            for (WebSocket socket : sockets) socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
        }
    }

    @Test
    void sevenBotsAndTheHumanKeepDistinctAppearancesWhenGameStarts() throws Exception {
        MessageListener messages = new MessageListener();
        WebSocket socket = HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/game"), messages).get(5, TimeUnit.SECONDS);
        try {
            socket.sendText("{\"type\":\"create\",\"nickname\":\"혜성탐험가\",\"mascot\":18}", true).join();
            messages.await("joined", json); messages.awaitState("waiting", json);
            JsonNode waiting = null;
            for (int i = 0; i < 7; i++) {
                socket.sendText("{\"type\":\"addBot\"}", true).join();
                waiting = messages.awaitState("waiting", json);
                assertEquals(i + 2, waiting.get("players").size());
            }
            var unique = new HashSet<Integer>();
            for (JsonNode player : waiting.get("players")) assertTrue(unique.add(player.get("mascot").asInt()));
            assertEquals(8, unique.size());
            assertEquals(18, waiting.get("players").get(0).get("mascot").asInt());
            socket.sendText("{\"type\":\"start\"}", true).join();
            JsonNode playing = messages.awaitState("playing", json);
            for (int i = 0; i < 8; i++) assertEquals(waiting.get("players").get(i).get("mascot").asInt(), playing.get("players").get(i).get("mascot").asInt());
        } finally {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
        }
    }

    @Test
    void hostCanTuneDifficultyAndRemoveBotsBeforeStarting() throws Exception {
        MessageListener messages = new MessageListener();
        WebSocket socket = HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/game"), messages).get(5, TimeUnit.SECONDS);
        try {
            socket.sendText("{\"type\":\"create\",\"nickname\":\"우주항해사\",\"difficulty\":\"beginner\"}", true).join();
            messages.await("joined", json); messages.awaitState("waiting", json);
            socket.sendText("{\"type\":\"addBot\"}", true).join();
            JsonNode withBot = messages.awaitState("waiting", json);
            assertEquals("beginner", withBot.get("difficulty").get("id").asText());
            String botId = withBot.get("players").get(1).get("id").asText();
            socket.sendText("{\"type\":\"setDifficulty\",\"difficulty\":\"advanced\"}", true).join();
            JsonNode advanced = messages.awaitState("waiting", json);
            assertEquals("advanced", advanced.get("difficulty").get("id").asText());
            socket.sendText("{\"type\":\"removeBot\",\"botId\":\"" + botId + "\"}", true).join();
            JsonNode removed = messages.awaitState("waiting", json);
            assertEquals(1, removed.get("players").size());
            assertEquals("advanced", removed.get("difficulty").get("id").asText());
        } finally {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
        }
    }

    private static final class MessageListener implements WebSocket.Listener {
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final StringBuilder partial = new StringBuilder();

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                messages.add(partial.toString());
                partial.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        JsonNode await(String type, JsonMapper json) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                String payload = messages.poll(500, TimeUnit.MILLISECONDS);
                if (payload == null) continue;
                JsonNode node = json.readTree(payload);
                if (type.equals(node.get("type").asText())) return node;
            }
            throw new AssertionError("Timed out waiting for message type " + type);
        }

        JsonNode awaitState(String phase, JsonMapper json) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                String payload = messages.poll(500, TimeUnit.MILLISECONDS);
                if (payload == null) continue;
                JsonNode node = json.readTree(payload);
                if ("state".equals(node.get("type").asText()) && phase.equals(node.get("phase").asText())) return node;
            }
            throw new AssertionError("Timed out waiting for phase " + phase);
        }

        JsonNode awaitStateEvent(String text, JsonMapper json) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                String payload = messages.poll(500, TimeUnit.MILLISECONDS);
                if (payload == null) continue;
                JsonNode node = json.readTree(payload);
                if ("state".equals(node.get("type").asText())
                        && node.get("eventText").asText().contains(text)) return node;
            }
            throw new AssertionError("Timed out waiting for state event " + text);
        }
    }
}
