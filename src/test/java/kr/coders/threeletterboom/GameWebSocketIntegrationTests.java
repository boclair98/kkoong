package kr.coders.threeletterboom;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GameWebSocketIntegrationTests {
    @LocalServerPort
    int port;

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void createsRoomStartsWithBotRejectsWrongLengthAndLetsBotRhythmPass() throws Exception {
        MessageListener listener = new MessageListener();
        WebSocket socket = HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/game"), listener).get(5, TimeUnit.SECONDS);

        socket.sendText("{\"type\":\"create\",\"mode\":\"classic\",\"nickname\":\"테스터\",\"playerId\":\"guest-test-1234\"}", true).join();
        JsonNode joined = listener.await("joined", json);
        assertEquals(5, joined.get("roomCode").asText().length());
        JsonNode waiting = listener.awaitState("waiting", json);
        assertEquals(1, waiting.get("players").size());

        socket.sendText("{\"type\":\"start\"}", true).join();
        JsonNode playing = listener.awaitState("playing", json);
        assertEquals(2, playing.get("players").size());
        assertNotNull(playing.get("requiredSyllable").asText());
        assertTrue(playing.get("deadline").asLong() > System.currentTimeMillis());

        if (playing.get("turnPlayerId").asText().equals(joined.get("playerId").asText())) {
            String first = playing.get("requiredSyllable").asText();
            socket.sendText("{\"type\":\"word\",\"word\":\"" + first + "나\"}", true).join();
            JsonNode error = listener.await("error", json);
            assertEquals("WRONG_LENGTH", error.get("code").asText());

            socket.sendText("{\"type\":\"word\",\"word\":\"" + first + "가거\"}", true).join();
            JsonNode rhythmPass = listener.awaitStateEvent("리듬 패스", json);
            JsonNode bot = rhythmPass.get("players").get(1);
            assertTrue(bot.get("bot").asBoolean());
            assertEquals(2, bot.get("lives").asInt());
            assertEquals(joined.get("playerId").asText(), rhythmPass.get("turnPlayerId").asText());
        }
        socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
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
