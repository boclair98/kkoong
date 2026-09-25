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
    private final Map<String, List<String>> friendlyByFirst = new HashMap<>();
    private final Random random = new Random();

    public WordDictionary() {
        readWords("words-ko.txt", word -> {
            words.add(word);
            byFirst.computeIfAbsent(firstSyllable(word), ignored -> new ArrayList<>()).add(word);
        });
        readWords("bot-words-ko.txt", word -> {
            if (words.contains(word)) {
                friendlyByFirst.computeIfAbsent(firstSyllable(word), ignored -> new ArrayList<>()).add(word);
            }
        });
        byFirst.values().forEach(Collections::shuffle);
        friendlyByFirst.values().forEach(Collections::shuffle);
    }

    private void readWords(String resource, java.util.function.Consumer<String> consumer) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource(resource).getInputStream(), StandardCharsets.UTF_8))) {
            reader.lines().map(String::trim).filter(line -> !line.isBlank() && !line.startsWith("#"))
                    .map(WordDictionary::normalize).filter(WordDictionary::isHangulWord)
                    .filter(word -> !ContentSafety.isBlocked(word)).forEach(consumer);
        } catch (Exception exception) {
            throw new IllegalStateException("내장 단어 사전을 읽지 못했습니다: " + resource, exception);
        }
    }

    public boolean isKnown(String word) {
        return words.contains(normalize(word));
    }

    public String pick(String first, GameMode mode, Set<String> used) {
        List<String> friendly = playable(friendlyByFirst.getOrDefault(first, List.of()), mode, used);
        if (!friendly.isEmpty()) return friendly.get(random.nextInt(friendly.size()));
        List<String> candidates = playable(byFirst.getOrDefault(first, List.of()), mode, used);
        if (candidates.isEmpty()) return null;
        return candidates.get(random.nextInt(candidates.size()));
    }

    private List<String> playable(List<String> source, GameMode mode, Set<String> used) {
        return source.stream()
                .filter(word -> word.length() >= mode.minLength() && word.length() <= mode.maxLength())
                .filter(word -> !used.contains(word))
                .filter(word -> byFirst.getOrDefault(lastSyllable(word), List.of()).stream()
                        .anyMatch(next -> next.length() >= mode.minLength() && next.length() <= mode.maxLength()
                                && !used.contains(next) && !next.equals(word)))
                .toList();
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

    public int friendlySize() { return friendlyByFirst.values().stream().mapToInt(List::size).sum(); }

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
