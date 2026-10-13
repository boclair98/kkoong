package kr.coders.threeletterboom.web;

import kr.coders.threeletterboom.game.RoomService;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {
    private static final int MAX_MESSAGE_BYTES = 4_096;
    private final RoomService rooms;
    private final Map<String, MessageBudget> connections = new ConcurrentHashMap<>();

    public GameWebSocketHandler(RoomService rooms) {
        this.rooms = rooms;
    }

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession session) throws IOException {
        if (connections.size() >= 500) {
            session.close(CloseStatus.SERVICE_OVERLOAD);
            return;
        }
        connections.put(session.getId(), new MessageBudget());
        session.setTextMessageSizeLimit(MAX_MESSAGE_BYTES);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        MessageBudget budget = connections.get(session.getId());
        if (budget == null || !budget.allow(System.currentTimeMillis())) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("too many requests"));
            return;
        }
        if (message.getPayloadLength() > MAX_MESSAGE_BYTES) { session.close(CloseStatus.TOO_BIG_TO_PROCESS); return; }
        rooms.handle(session, message.getPayload());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        connections.remove(session.getId());
        rooms.disconnected(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws IOException {
        connections.remove(session.getId());
        rooms.disconnected(session);
        if (session.isOpen()) session.close(CloseStatus.SERVER_ERROR);
    }

    static final class MessageBudget {
        private long startedAt;
        private int count;
        synchronized boolean allow(long now) {
            if (count == 0 || now - startedAt >= 10_000 || now < startedAt) { startedAt = now; count = 0; }
            return ++count <= 60;
        }
    }
}
