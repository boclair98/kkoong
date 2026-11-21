package kr.coders.threeletterboom.web;

import jakarta.websocket.Session;
import kr.coders.threeletterboom.game.RoomService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.adapter.NativeWebSocketSession;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GameWebSocketHandlerTests {
    @Test
    void messageBudgetAllowsNormalBurstsButBoundsFloodsAndResets() {
        var budget = new GameWebSocketHandler.MessageBudget();
        for (int i = 0; i < 60; i++) assertTrue(budget.allow(1_000));
        assertFalse(budget.allow(1_000));
        assertFalse(budget.allow(10_999));
        assertTrue(budget.allow(11_000));
        assertTrue(budget.allow(0)); // A clock correction cannot permanently lock a connection.
    }

    @Test
    void acceptedJakartaConnectionUsesALongBlockingTimeoutAndKeepsTextLimitAndDispatch() throws Exception {
        var rooms = mock(RoomService.class);
        var handler = new GameWebSocketHandler(rooms);
        var session = mock(NativeWebSocketSession.class);
        var jakartaSession = mock(Session.class);
        var properties = new HashMap<String, Object>();
        properties.put("application-setting", "preserved");
        when(session.getId()).thenReturn("native");
        when(session.getNativeSession(Session.class)).thenReturn(jakartaSession);
        when(jakartaSession.getUserProperties()).thenReturn(properties);

        handler.afterConnectionEstablished(session);
        assertEquals(Long.valueOf(1_500), properties.get("org.apache.tomcat.websocket.BLOCKING_SEND_TIMEOUT"));
        assertEquals("preserved", properties.get("application-setting"));
        verify(session).setTextMessageSizeLimit(4_096);
        handler.handleTextMessage(session, new TextMessage("{\"type\":\"ping\"}"));
        verify(rooms).handle(session, "{\"type\":\"ping\"}");
        verify(session, never()).close(any());
    }

    @Test
    void missingJakartaSessionAndNonNativeTransportKeepExistingBehavior() throws Exception {
        var rooms = mock(RoomService.class);
        var handler = new GameWebSocketHandler(rooms);
        var nativeSession = mock(NativeWebSocketSession.class);
        var fallbackSession = mock(WebSocketSession.class);
        when(nativeSession.getId()).thenReturn("missing-native");
        when(fallbackSession.getId()).thenReturn("fallback");

        handler.afterConnectionEstablished(nativeSession);
        handler.afterConnectionEstablished(fallbackSession);
        for (WebSocketSession session : new WebSocketSession[] {nativeSession, fallbackSession}) {
            verify(session).setTextMessageSizeLimit(4_096);
            handler.handleTextMessage(session, new TextMessage("ping"));
            verify(rooms).handle(session, "ping");
            verify(session, never()).close(any());
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void rejectedConnectionIsNotRegisteredOrConfigured() throws Exception {
        var rooms = mock(RoomService.class);
        var handler = new GameWebSocketHandler(rooms);
        var connections = (Map<String, GameWebSocketHandler.MessageBudget>) ReflectionTestUtils.getField(handler, "connections");
        for (int i = 0; i < 500; i++) connections.put("existing-" + i, new GameWebSocketHandler.MessageBudget());
        var rejected = mock(NativeWebSocketSession.class);
        when(rejected.getId()).thenReturn("overflow");

        handler.afterConnectionEstablished(rejected);
        verify(rejected).close(CloseStatus.SERVICE_OVERLOAD);
        verify(rejected, never()).getNativeSession(Session.class);
        verify(rejected, never()).setTextMessageSizeLimit(anyInt());
        assertFalse(connections.containsKey("overflow"));
        handler.handleTextMessage(rejected, new TextMessage("ping"));
        verify(rooms, never()).handle(any(), anyString());
    }
}
