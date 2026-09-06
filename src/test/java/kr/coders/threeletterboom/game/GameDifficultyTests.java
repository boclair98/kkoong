package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.Test;

import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GameDifficultyTests {
    @Test
    void beginnerIsSlowerAndMoreForgivingThanAdvanced() {
        Random random = new Random(7);
        int beginnerTotal = 0;
        int advancedTotal = 0;
        for (int i = 0; i < 100; i++) {
            beginnerTotal += GameDifficulty.BEGINNER.thinkMillis(random);
            advancedTotal += GameDifficulty.ADVANCED.thinkMillis(random);
        }
        assertTrue(beginnerTotal > advancedTotal * 2);
    }

    @Test
    void turnLimitTightensEveryThreeTurnsButNeverDropsBelowFiveSeconds() {
        assertEquals(12, GameMode.CLASSIC.turnSecondsForTurn(1, false));
        assertEquals(12, GameMode.CLASSIC.turnSecondsForTurn(3, false));
        assertEquals(11, GameMode.CLASSIC.turnSecondsForTurn(4, false));
        assertEquals(5, GameMode.CLASSIC.turnSecondsForTurn(40, false));
        assertEquals(10, GameMode.CLASSIC.turnSecondsForTurn(1, true));
    }
}
