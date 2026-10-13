package kr.coders.threeletterboom.web;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

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
}
