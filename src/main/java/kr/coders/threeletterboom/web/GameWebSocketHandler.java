package kr.coders.threeletterboom.web;

import kr.coders.threeletterboom.game.RoomService;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {
    private static final int MAX_MESSAGE_BYTES = 4_096;
    private final RoomService rooms;

    public GameWebSocketHandler(RoomService rooms) {
        this.rooms = rooms;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        session.setTextMessageSizeLimit(MAX_MESSAGE_BYTES);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        if (message.getPayloadLength() <= MAX_MESSAGE_BYTES) rooms.handle(session, message.getPayload());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        rooms.disconnected(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        rooms.disconnected(session);
    }
}
