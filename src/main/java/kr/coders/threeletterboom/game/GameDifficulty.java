package kr.coders.threeletterboom.game;

import java.util.Locale;
import java.util.Random;

/** Bot skill presets; beginner is intentionally forgiving for first-time players. */
public enum GameDifficulty {
    BEGINNER("beginner", "초급", "천천히 생각하고 가끔 실수해요", 1500, 1400, 0.42),
    INTERMEDIATE("intermediate", "중급", "적당한 속도와 실력", 950, 1050, 0.20),
    ADVANCED("advanced", "고급", "빠르고 빈틈이 적어요", 520, 620, 0.07);

    private final String id;
    private final String label;
    private final String description;
    private final int thinkBaseMs;
    private final int thinkJitterMs;
    private final double mistakeChance;

    GameDifficulty(String id, String label, String description, int thinkBaseMs, int thinkJitterMs, double mistakeChance) {
        this.id = id;
        this.label = label;
        this.description = description;
        this.thinkBaseMs = thinkBaseMs;
        this.thinkJitterMs = thinkJitterMs;
        this.mistakeChance = mistakeChance;
    }

    public String id() { return id; }
    public String label() { return label; }
    public String description() { return description; }
    public int thinkMillis(Random random) { return thinkBaseMs + random.nextInt(thinkJitterMs + 1); }
    public boolean makesMistake(Random random) { return random.nextDouble() < mistakeChance; }

    public static GameDifficulty from(String value) {
        if (value != null) {
            String normalized = value.toLowerCase(Locale.ROOT);
            for (GameDifficulty difficulty : values()) if (difficulty.id.equals(normalized)) return difficulty;
        }
        return BEGINNER;
    }
}
