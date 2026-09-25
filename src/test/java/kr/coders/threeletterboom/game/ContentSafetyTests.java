package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContentSafetyTests {
    @Test
    void blocksDirectAndObfuscatedAbusiveNames() {
        assertTrue(ContentSafety.isBlocked("시 발"));
        assertTrue(ContentSafety.isBlocked("씨1발"));
        assertTrue(ContentSafety.isBlocked("Sh1t"));
        assertTrue(ContentSafety.isBlocked("귀여운병신"));
        assertTrue(ContentSafety.isBlocked("야동탐험"));
        assertTrue(ContentSafety.isBlocked("대갈통"));
        assertTrue(ContentSafety.isBlocked("꼬라지"));
        assertTrue(ContentSafety.isBlocked("미친개"));
    }

    @Test
    void acceptsOrdinarySpaceAndHangulNames() {
        assertFalse(ContentSafety.isBlocked("우주 탐험가"));
        assertFalse(ContentSafety.isBlocked("쿵봇친구"));
        assertFalse(ContentSafety.isBlocked("별빛 42"));
    }
}
