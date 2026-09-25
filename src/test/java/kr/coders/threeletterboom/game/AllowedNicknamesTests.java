package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AllowedNicknamesTests {
    @Test
    void offersOnlyDistinctReviewedNames() {
        assertEquals(24, AllowedNicknames.all().size());
        assertEquals(24, AllowedNicknames.all().stream().distinct().count());
        assertTrue(AllowedNicknames.all().stream().noneMatch(ContentSafety::isBlocked));
        assertTrue(AllowedNicknames.contains("별빛탐험가"));
        assertFalse(AllowedNicknames.contains("임의별명"));
        assertFalse(AllowedNicknames.contains("별빛탐험가 "));
    }
}
