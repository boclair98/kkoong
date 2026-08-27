package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.Test;

import java.util.HashSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WordDictionaryTests {
    private final WordDictionary dictionary = new WordDictionary();

    @Test
    void loadsStrictNationalDictionaryNouns() {
        assertTrue(dictionary.size() >= 30_000);
        assertTrue(dictionary.friendlySize() >= 250);
        assertTrue(dictionary.isKnown("고구마"));
        assertTrue(dictionary.isKnown("사과나무"));
        assertTrue(dictionary.isKnown("우주선"));
        assertFalse(dictionary.isKnown("가가거"));
        assertFalse(dictionary.isKnown("가뷁쀍"));
    }

    @Test
    void normalizesSpacesAndChoosesAPlayableChain() {
        assertEquals("고구마", WordDictionary.normalize(" 고 구 마 "));
        String word = dictionary.pick("고", GameMode.CLASSIC, new HashSet<>());
        assertNotNull(word);
        assertEquals(3, word.length());
        assertEquals("고", WordDictionary.firstSyllable(word));
    }

    @Test
    void rejectsNonHangulShapes() {
        assertTrue(WordDictionary.isHangulWord("마법사"));
        assertTrue(!WordDictionary.isHangulWord("마법사!"));
        assertTrue(!WordDictionary.isHangulWord("abc"));
    }
}
