package kr.coders.threeletterboom.game;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

@Component
public class WordDictionary {
    private final Set<String> words = new HashSet<>();
    private final Map<String, List<String>> byFirst = new HashMap<>();
    private final Random random = new Random();

    public WordDictionary() {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource("words-ko.txt").getInputStream(), StandardCharsets.UTF_8))) {
            reader.lines().map(String::trim).filter(line -> !line.isBlank() && !line.startsWith("#"))
                    .map(WordDictionary::normalize).forEach(word -> {
                        words.add(word);
                        byFirst.computeIfAbsent(firstSyllable(word), ignored -> new ArrayList<>()).add(word);
                    });
        } catch (Exception exception) {
            throw new IllegalStateException("내장 단어 사전을 읽지 못했습니다", exception);
        }
        byFirst.values().forEach(Collections::shuffle);
    }

    public boolean isKnown(String word) {
        return words.contains(normalize(word));
    }

    public String pick(String first, GameMode mode, Set<String> used) {
        List<String> candidates = byFirst.getOrDefault(first, List.of()).stream()
                .filter(word -> word.length() >= mode.minLength() && word.length() <= mode.maxLength())
                .filter(word -> !used.contains(word))
                .filter(word -> byFirst.getOrDefault(lastSyllable(word), List.of()).stream()
                        .anyMatch(next -> next.length() >= mode.minLength() && next.length() <= mode.maxLength()
                                && !used.contains(next) && !next.equals(word)))
                .toList();
        if (candidates.isEmpty()) return null;
        return candidates.get(random.nextInt(candidates.size()));
    }

    public String pickStarter(GameMode mode) {
        List<String> starters = List.of("가", "고", "나", "다", "마", "바", "사", "아", "자", "하");
        List<String> possible = starters.stream()
                .filter(first -> byFirst.getOrDefault(first, List.of()).stream()
                        .anyMatch(word -> word.length() >= mode.minLength() && word.length() <= mode.maxLength()))
                .toList();
        return possible.get(random.nextInt(possible.size()));
    }

    public int size() { return words.size(); }

    public static String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value.strip().replaceAll("\\s+", ""), Normalizer.Form.NFC);
    }

    public static boolean isHangulWord(String word) {
        return word != null && word.matches("[가-힣]+");
    }

    public static String firstSyllable(String word) {
        return word == null || word.isEmpty() ? "" : word.substring(0, 1);
    }

    public static String lastSyllable(String word) {
        return word == null || word.isEmpty() ? "" : word.substring(word.length() - 1);
    }
}
