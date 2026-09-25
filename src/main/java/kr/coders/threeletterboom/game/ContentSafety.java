package kr.coders.threeletterboom.game;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/** Server-side display-name and dictionary guard; keep the lists conservative and reviewable. */
final class ContentSafety {
    private static final Set<String> KOREAN_BLOCKED = Set.of(
            "씨발", "시발", "씨팔", "십팔", "씹", "좆", "존나", "개새끼", "새끼",
            "병신", "지랄", "미친놈", "미친년", "꺼져", "섹스", "야동", "보지",
            "자지", "강간", "멍청이", "젠장", "빌어먹을");
    private static final Set<String> LATIN_BLOCKED = Set.of(
            "fuck", "shit", "bitch", "asshole", "motherfucker", "cunt", "dick", "pussy", "rape");

    private ContentSafety() { }

    static boolean isBlocked(String value) {
        if (value == null || value.isBlank()) return false;
        String compact = Normalizer.normalize(value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT).replaceAll("[^가-힣a-z0-9]", "");
        String korean = compact.replaceAll("[0-9]", "");
        String latin = compact.replace('0', 'o').replace('1', 'i').replace('3', 'e')
                .replace('4', 'a').replace('5', 's').replace('7', 't');
        return KOREAN_BLOCKED.stream().anyMatch(korean::contains)
                || LATIN_BLOCKED.stream().anyMatch(latin::contains);
    }
}
