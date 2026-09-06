package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoomServiceTransportTests {
    @Test
    void closingTransportBetweenOpenCheckAndSendDoesNotAbortOtherRecipients() throws Exception {
        RoomService service = new RoomService(JsonMapper.builder().build(), mock(WordDictionary.class));
        WebSocketSession closing = mock(WebSocketSession.class);
        WebSocketSession healthy = mock(WebSocketSession.class);
        when(closing.isOpen()).thenReturn(true);
        when(healthy.isOpen()).thenReturn(true);
        doThrow(new IllegalStateException("WebSocket session has been closed"))
                .when(closing).sendMessage(any(TextMessage.class));
        try {
            assertDoesNotThrow(() -> {
                ReflectionTestUtils.invokeMethod(service, "sendText", closing, "state");
                ReflectionTestUtils.invokeMethod(service, "sendText", healthy, "state");
            });
            verify(healthy).sendMessage(any(TextMessage.class));
        } finally {
            service.shutdown();
        }
    }
}
