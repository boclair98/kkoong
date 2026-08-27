package kr.coders.threeletterboom.game;

import java.util.Locale;

public enum GameMode {
    CLASSIC("classic", "기본 궤도", 3, 3, 12, 2),
    SPEED("speed", "펄스 항로", 3, 3, 7, 2),
    RELAY("relay", "자유 항로", 2, 4, 10, 2);

    private final String id;
    private final String label;
    private final int minLength;
    private final String maxLengthText;
    private final int maxLength;
    private final int turnSeconds;
    private final int lives;

    GameMode(String id, String label, int minLength, int maxLength, int turnSeconds, int lives) {
        this.id = id;
        this.label = label;
        this.minLength = minLength;
        this.maxLength = maxLength;
        this.maxLengthText = minLength == maxLength ? minLength + "글자" : minLength + "~" + maxLength + "글자";
        this.turnSeconds = turnSeconds;
        this.lives = lives;
    }

    public String id() { return id; }
    public String label() { return label; }
    public int minLength() { return minLength; }
    public int maxLength() { return maxLength; }
    public String lengthText() { return maxLengthText; }
    public int turnSeconds() { return turnSeconds; }
    public int lives() { return lives; }

    public static GameMode from(String value) {
        if (value == null) return CLASSIC;
        String normalized = value.toLowerCase(Locale.ROOT);
        for (GameMode mode : values()) {
            if (mode.id.equals(normalized)) return mode;
        }
        return CLASSIC;
    }
}
