package kr.coders.threeletterboom.game;

import org.springframework.web.socket.WebSocketSession;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class GameRoom {
    enum Phase { WAITING, PLAYING, FINISHED }

    final String code;
    final GameMode mode;
    final boolean duelQueue;
    GameDifficulty difficulty;
    final Map<String, Player> players = new LinkedHashMap<>();
    final Set<String> usedWords = new LinkedHashSet<>();
    final List<WordPlay> history = new ArrayList<>();
    final Instant createdAt = Instant.now();
    String hostId;
    Phase phase = Phase.WAITING;
    int turnIndex;
    int combo;
    int round;
    long turnStartedAt;
    long deadline;
    long botActionAt;
    int turnCount;
    long updatedAt = System.currentTimeMillis();
    String requiredSyllable;
    String lastWord;
    String winnerId;
    String eventText = "방이 만들어졌어요";

    GameRoom(String code, GameMode mode) {
        this(code, mode, GameDifficulty.BEGINNER);
    }

    GameRoom(String code, GameMode mode, GameDifficulty difficulty) {
        this(code, mode, difficulty, false);
    }

    GameRoom(String code, GameMode mode, GameDifficulty difficulty, boolean duelQueue) {
        this.code = code;
        this.mode = mode;
        this.difficulty = difficulty;
        this.duelQueue = duelQueue;
    }

    static final class Player {
        final String id;
        String nickname;
        boolean bot;
        boolean connected;
        boolean eliminated;
        int score;
        int lives;
        int streak;
        int wins;
        int mascot;
        int hintsRemaining = 3;
        long disconnectedAt;
        WebSocketSession session;

        Player(String id, String nickname, boolean bot, int lives, WebSocketSession session) {
            this.id = id;
            this.mascot = Math.floorMod(id.hashCode(), MascotRoster.SIZE);
            this.nickname = nickname;
            this.bot = bot;
            this.lives = lives;
            this.session = session;
            this.connected = bot || session != null;
        }
    }

    record WordPlay(String playerId, String nickname, String word, int points, long at) { }
}
