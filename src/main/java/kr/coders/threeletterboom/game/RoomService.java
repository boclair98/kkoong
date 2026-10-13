package kr.coders.threeletterboom.game;

import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class RoomService {
    private static final int MAX_PLAYERS = 8;
    private static final int HINTS_PER_ROUND = 3;
    private static final int HINT_COST = 40;
    private static final int MAX_ROOMS = 200;
    private static final long RECONNECT_GRACE_MS = 30_000;
    private static final Set<String> REACTIONS = Set.of("👏", "🔥", "😱", "ㅋㅋ", "💥", "💡");
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final JsonMapper json;
    private final WordDictionary dictionary;
    private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();
    private final Map<String, Location> sessionLocations = new ConcurrentHashMap<>();
    private final Map<String, Long> reactionTimes = new ConcurrentHashMap<>();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(
            task -> new Thread(task, "game-ticker"));
    private final Random random = new Random();

    public RoomService(JsonMapper json, WordDictionary dictionary) {
        this.json = json;
        this.dictionary = dictionary;
        ticker.scheduleAtFixedRate(this::tickSafely, 200, 200, TimeUnit.MILLISECONDS);
    }

    public void handle(WebSocketSession session, String payload) {
        try {
            JsonNode message = json.readTree(payload);
            String type = text(message, "type");
            switch (type) {
                case "create" -> create(session, message);
                case "join" -> join(session, message);
                case "quickJoin" -> quickJoin(session, message);
                case "duelQueue" -> duelQueue(session, message);
                case "start" -> withPlayer(session, (room, player) -> start(room, player));
                case "word" -> withPlayer(session, (room, player) -> { requireCurrentTurn(room, message); submitWord(room, player, text(message, "word")); });
                case "hint" -> withPlayer(session, (room, player) -> { requireCurrentTurn(room, message); requestHint(room, player); });
                case "react" -> withPlayer(session, (room, player) -> react(room, player, text(message, "emoji")));
                case "addBot" -> withPlayer(session, this::addBot);
                case "removeBot" -> withPlayer(session, (room, player) -> removeBot(room, player, text(message, "botId")));
                case "setDifficulty" -> withPlayer(session, (room, player) -> setDifficulty(room, player, text(message, "difficulty")));
                case "rematch" -> withPlayer(session, (room, player) -> rematch(room, player));
                case "leave" -> leave(session, true);
                case "ping" -> send(session, Map.of("type", "pong", "serverTime", System.currentTimeMillis()));
                default -> throw new GameProblem("UNKNOWN_MESSAGE", "알 수 없는 요청이에요");
            }
        } catch (GameProblem problem) {
            sendError(session, problem.code, problem.getMessage());
        } catch (Exception exception) {
            sendError(session, "BAD_MESSAGE", "메시지를 처리하지 못했어요");
        }
    }

    public void disconnected(WebSocketSession session) {
        leave(session, false);
    }

    public List<Map<String, Object>> lobbyRooms() {
        return rooms.values().stream().filter(room -> {
                    synchronized (room) {
                        return !room.duelQueue && room.phase == GameRoom.Phase.WAITING
                                && room.players.size() < MAX_PLAYERS
                                && room.players.values().stream().anyMatch(player -> !player.bot && player.connected);
                    }
                })
                .sorted(Comparator.comparing(room -> room.createdAt))
                .limit(12)
                .map(room -> {
                    synchronized (room) {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("code", room.code);
                        item.put("mode", room.mode.id());
                        item.put("modeLabel", room.mode.label());
                        item.put("players", (int) room.players.values().stream().filter(player -> !player.bot).count());
                        item.put("bots", (int) room.players.values().stream().filter(player -> player.bot).count());
                        item.put("maxPlayers", MAX_PLAYERS);
                        return item;
                    }
                }).toList();
    }

    public Map<String, Object> publicStats() {
        int connected = rooms.values().stream().mapToInt(room -> {
            synchronized (room) {
                return (int) room.players.values().stream().filter(player -> player.connected && !player.bot).count();
            }
        }).sum();
        long playing = rooms.values().stream().filter(room -> room.phase == GameRoom.Phase.PLAYING).count();
        return Map.of("connectedPlayers", connected, "activeGames", playing, "openRooms", lobbyRooms().size(),
                "dictionaryWords", dictionary.size(), "mascotCount", MascotRoster.SIZE);
    }

    private void create(WebSocketSession session, JsonNode message) {
        requireUnassigned(session);
        cleanNickname(text(message, "nickname"));
        GameMode mode = GameMode.from(text(message, "mode"));
        String code = newCode();
        GameRoom room = new GameRoom(code, mode, GameDifficulty.from(text(message, "difficulty")));
        registerRoom(room);
        joinRoom(session, message, room);
    }

    private void join(WebSocketSession session, JsonNode message) {
        String code = normalizeCode(text(message, "code"));
        GameRoom room = rooms.get(code);
        if (room == null) throw new GameProblem("ROOM_NOT_FOUND", "그 방을 찾지 못했어요. 코드를 다시 확인해 주세요");
        joinRoom(session, message, room);
    }

    private void quickJoin(WebSocketSession session, JsonNode message) {
        requireUnassigned(session);
        cleanNickname(text(message, "nickname"));
        GameMode mode = GameMode.from(text(message, "mode"));
        GameRoom room = rooms.values().stream()
                .filter(candidate -> {
                    synchronized (candidate) {
                        return !candidate.duelQueue && candidate.mode == mode && candidate.phase == GameRoom.Phase.WAITING
                                && candidate.players.size() < MAX_PLAYERS;
                    }
                })
                .findFirst().orElseGet(() -> {
                    GameRoom created = new GameRoom(newCode(), mode, GameDifficulty.from(text(message, "difficulty")));
                    registerRoom(created);
                    return created;
                });
        joinRoom(session, message, room);
    }

    private void duelQueue(WebSocketSession session, JsonNode message) {
        requireUnassigned(session);
        cleanNickname(text(message, "nickname"));
        GameMode mode = GameMode.from(text(message, "mode"));
        for (int attempt = 0; attempt < 4; attempt++) {
            GameRoom waiting = rooms.values().stream()
                    .filter(candidate -> {
                        synchronized (candidate) {
                            return candidate.duelQueue && candidate.mode == mode
                                    && candidate.phase == GameRoom.Phase.WAITING && candidate.players.size() < 2;
                        }
                    })
                    .min(Comparator.comparing(candidate -> candidate.createdAt)).orElse(null);
            if (waiting == null) break;
            try {
                joinRoom(session, message, waiting);
                return;
            } catch (GameProblem problem) {
                if (!"ROOM_FULL".equals(problem.code) && !"GAME_STARTED".equals(problem.code)) throw problem;
            }
        }
        GameRoom created = new GameRoom(newCode(), mode, GameDifficulty.from(text(message, "difficulty")), true);
        registerRoom(created);
        joinRoom(session, message, created);
    }

    private void joinRoom(WebSocketSession session, JsonNode message, GameRoom room) {
        Location assigned = sessionLocations.get(session.getId());
        if (assigned != null && !assigned.roomCode.equals(room.code)) {
            throw new GameProblem("ALREADY_IN_ROOM", "현재 방에서 나간 뒤 다른 방에 들어가 주세요");
        }
        String playerId = resolvePlayerId(session, text(message, "playerId"));
        String nickname = cleanNickname(text(message, "nickname"));
        synchronized (room) {
            int requestedMascot = message.path("mascot").asInt(-1);
            GameRoom.Player player = room.players.get(playerId);
            if (player == null) {
                if (room.phase == GameRoom.Phase.FINISHED) {
                    throw new GameProblem("GAME_FINISHED", "이 판은 끝났어요. 새 방에서 다시 만나요");
                }
                if (room.phase != GameRoom.Phase.WAITING) {
                    throw new GameProblem("GAME_STARTED", "이미 시작한 방이에요");
                }
                if (room.players.size() >= (room.duelQueue ? 2 : MAX_PLAYERS)) {
                    throw new GameProblem("ROOM_FULL", "방이 꽉 찼어요");
                }
                player = new GameRoom.Player(playerId, nickname, false, room.mode.lives(), session);
                player.protectedResume = message.path("protocolVersion").asInt(1) >= 2;
                player.mascot = MascotRoster.choose(room, playerId, requestedMascot, random);
                room.players.put(playerId, player);
                if (room.hostId == null) room.hostId = playerId;
                room.eventText = nickname + "님이 들어왔어요";
            } else {
                if (player.bot || (player.protectedResume && player.session != session
                        && !MessageDigest.isEqual(player.resumeToken.getBytes(StandardCharsets.UTF_8),
                        text(message, "resumeToken").getBytes(StandardCharsets.UTF_8)))) {
                    throw new GameProblem("RESUME_DENIED", "복귀 정보를 확인하지 못했어요. 로비에서 새 방으로 시작해 주세요");
                }
                if (player.session != null && player.session != session) sessionLocations.remove(player.session.getId());
                player.nickname = nickname;
                player.session = session;
                player.connected = true;
                player.disconnectedAt = 0;
                room.eventText = nickname + "님이 돌아왔어요";
            }
            // Reconnect keeps the room assignment, even if the saved preference differs.
            room.updatedAt = System.currentTimeMillis();
            sessionLocations.put(session.getId(), new Location(room.code, playerId));
            Map<String, Object> joined = new LinkedHashMap<>(Map.of("type", "joined", "roomCode", room.code, "playerId", playerId,
                    "mascot", player.mascot, "mascotAdjusted", requestedMascot >= 0 && requestedMascot != player.mascot));
            if (player.protectedResume) joined.put("resumeToken", player.resumeToken);
            send(session, joined);
            broadcastState(room);
            if (room.duelQueue && room.phase == GameRoom.Phase.WAITING
                    && room.players.values().stream().filter(p -> !p.bot && p.connected).count() == 2) {
                resetRound(room);
                broadcastState(room);
            }
        }
    }

    private void start(GameRoom room, GameRoom.Player requester) {
        synchronized (room) {
            if (room.duelQueue) throw new GameProblem("DUEL_AUTO", "1:1 대전은 상대가 오면 자동으로 시작해요");
            requireHost(room, requester);
            if (room.phase != GameRoom.Phase.WAITING) throw new GameProblem("ALREADY_STARTED", "대기실에서만 시작할 수 있어요. 결과 화면에서는 한 판 더를 눌러 주세요");
            if (room.players.values().stream().filter(player -> !player.bot && player.connected).count() == 1
                    && room.players.values().stream().noneMatch(player -> player.bot)) {
                addBotInternal(room);
            }
            if (room.players.values().stream().filter(player -> player.connected || player.bot).count() < 2) {
                throw new GameProblem("NEED_PLAYERS", "두 명 이상 모이면 시작할 수 있어요");
            }
            resetRound(room);
            broadcastState(room);
        }
    }

    private void resetRound(GameRoom room) {
        room.phase = GameRoom.Phase.PLAYING;
        room.usedWords.clear();
        room.history.clear();
        room.combo = 0;
        room.round++;
        room.roundId = UUID.randomUUID().toString();
        room.turnCount = 0;
        room.lastWord = null;
        room.winnerId = null;
        room.requiredSyllable = dictionary.pickStarter(room.mode);
        room.turnIndex = 0;
        room.players.values().forEach(player -> {
            player.score = 0;
            player.lives = room.mode.lives();
            player.streak = 0;
            player.hintsRemaining = HINTS_PER_ROUND;
            player.wordsPlayed = 0;
            player.eliminated = !player.bot && !player.connected;
        });
        room.eventText = "첫 글자는 ‘" + room.requiredSyllable + "’ — 리듬 시작!";
        startTurn(room);
    }

    private void submitWord(GameRoom room, GameRoom.Player player, String rawWord) {
        synchronized (room) {
            requirePlaying(room);
            if (currentPlayer(room) != player) throw new GameProblem("NOT_YOUR_TURN", "지금은 다른 사람 차례예요");
            requireTimeRemaining(room, player);
            String word = WordDictionary.normalize(rawWord);
            validateWord(room, word);
            acceptWord(room, player, word);
            broadcastState(room);
        }
    }

    private void validateWord(GameRoom room, String word) {
        if (!WordDictionary.isHangulWord(word)) throw new GameProblem("HANGUL_ONLY", "한글 단어만 입력해 주세요");
        if (word.length() < room.mode.minLength() || word.length() > room.mode.maxLength()) {
            throw new GameProblem("WRONG_LENGTH", room.mode.lengthText() + " 단어가 필요해요");
        }
        if (!WordDictionary.firstSyllable(word).equals(room.requiredSyllable)) {
            throw new GameProblem("WRONG_START", "‘" + room.requiredSyllable + "’로 시작해야 해요");
        }
        if (room.usedWords.contains(word)) throw new GameProblem("DUPLICATE", "이미 나온 단어예요");
        if (!dictionary.isKnown(word)) {
            throw new GameProblem("NOT_IN_DICTIONARY", "사전에 없는 단어예요. 등록된 명사만 사용할 수 있어요");
        }
    }

    private void acceptWord(GameRoom room, GameRoom.Player player, String word) {
        long remainingSeconds = Math.max(0, (room.deadline - System.currentTimeMillis()) / 1000);
        boolean fever = room.combo >= 6;
        int points = 100 + (int) remainingSeconds * 8 + Math.min(room.combo, 10) * 6;
        if (fever) points *= 2;
        player.score += points;
        player.streak++;
        player.wordsPlayed++;
        room.combo++;
        room.lastWord = word;
        room.requiredSyllable = WordDictionary.lastSyllable(word);
        room.usedWords.add(word);
        room.history.add(new GameRoom.WordPlay(player.id, player.nickname, word, points, System.currentTimeMillis()));
        if (room.history.size() > 30) room.history.remove(0);
        room.eventText = player.nickname + " +" + points + " · 사전 인증";
        advanceTurn(room);
    }

    private void requestHint(GameRoom room, GameRoom.Player player) {
        synchronized (room) {
            requirePlaying(room);
            if (currentPlayer(room) != player) throw new GameProblem("NOT_YOUR_TURN", "지금은 다른 사람 차례예요");
            requireTimeRemaining(room, player);
            if (player.hintsRemaining <= 0) throw new GameProblem("NO_HINTS", "이번 궤도의 힌트를 모두 사용했어요");
            String word = dictionary.pick(room.requiredSyllable, room.mode, room.usedWords);
            if (word == null) throw new GameProblem("HINT_UNAVAILABLE", "이 글자로 이어갈 힌트를 찾지 못했어요");
            player.hintsRemaining--;
            player.score = Math.max(0, player.score - HINT_COST);
            room.eventText = player.nickname + "님이 탐색 힌트를 사용했어요 · -" + HINT_COST + "점";
            broadcastState(room);
            send(player.session, Map.of("type", "hint", "word", word, "remaining", player.hintsRemaining, "cost", HINT_COST));
        }
    }

    private void addBot(GameRoom room, GameRoom.Player requester) {
        synchronized (room) {
            if (room.duelQueue) throw new GameProblem("DUEL_AUTO", "1:1 대전에서는 쿵봇을 추가할 수 없어요");
            requireHost(room, requester);
            if (room.phase != GameRoom.Phase.WAITING) throw new GameProblem("GAME_STARTED", "대기 중에만 쿵봇을 부를 수 있어요");
            addBotInternal(room);
            broadcastState(room);
        }
    }

    private void addBotInternal(GameRoom room) {
        if (room.players.size() >= MAX_PLAYERS) throw new GameProblem("ROOM_FULL", "방이 꽉 찼어요");
        long bots = room.players.values().stream().filter(player -> player.bot).count();
        String id = "bot-" + UUID.randomUUID();
        String name = bots == 0 ? "쿵봇" : "쿵봇 " + (bots + 1);
        GameRoom.Player bot = new GameRoom.Player(id, name, true, room.mode.lives(), null);
        bot.mascot = MascotRoster.choose(room, id, -1, random);
        room.players.put(id, bot);
        room.eventText = name + "이 박자를 맞추러 왔어요";
    }

    private void removeBot(GameRoom room, GameRoom.Player requester, String botId) {
        synchronized (room) {
            requireHost(room, requester);
            if (room.phase != GameRoom.Phase.WAITING) throw new GameProblem("GAME_STARTED", "게임 시작 전 대기 중에만 쿵봇을 뺄 수 있어요");
            GameRoom.Player bot = room.players.get(botId);
            if (bot == null || !bot.bot) throw new GameProblem("BOT_NOT_FOUND", "뺄 쿵봇을 찾지 못했어요");
            room.players.remove(botId);
            room.eventText = bot.nickname + "이 대기실에서 나갔어요";
            room.updatedAt = System.currentTimeMillis();
            broadcastState(room);
        }
    }

    private void setDifficulty(GameRoom room, GameRoom.Player requester, String value) {
        synchronized (room) {
            requireHost(room, requester);
            if (room.phase != GameRoom.Phase.WAITING) throw new GameProblem("GAME_STARTED", "게임 시작 전 대기 중에만 난이도를 바꿀 수 있어요");
            GameDifficulty next = GameDifficulty.from(value);
            room.difficulty = next;
            room.eventText = "AI 난이도: " + next.label() + " · " + next.description();
            room.updatedAt = System.currentTimeMillis();
            broadcastState(room);
        }
    }

    private void react(GameRoom room, GameRoom.Player player, String emoji) {
        if (!REACTIONS.contains(emoji)) throw new GameProblem("BAD_REACTION", "지원하지 않는 반응이에요");
        long now = System.currentTimeMillis();
        long previous = reactionTimes.getOrDefault(player.id, 0L);
        if (now - previous < 600) return;
        reactionTimes.put(player.id, now);
        broadcast(room, Map.of("type", "reaction", "playerId", player.id, "nickname", player.nickname, "emoji", emoji));
    }

    private void rematch(GameRoom room, GameRoom.Player requester) {
        synchronized (room) {
            requireHost(room, requester);
            if (room.phase != GameRoom.Phase.FINISHED) throw new GameProblem("NOT_FINISHED", "현재 판이 끝난 뒤 다시 할 수 있어요");
            if (room.players.values().stream().filter(player -> player.bot || player.connected).count() < 2) {
                throw new GameProblem("NEED_PLAYERS", "친구가 복귀한 뒤 다시 시작해 주세요");
            }
            resetRound(room);
            broadcastState(room);
        }
    }

    private void leave(WebSocketSession session, boolean explicit) {
        Location location = sessionLocations.remove(session.getId());
        if (location == null) return;
        GameRoom room = rooms.get(location.roomCode);
        if (room == null) return;
        synchronized (room) {
            List<String> previousOrder = new ArrayList<>(room.players.keySet());
            String currentId = currentPlayer(room) == null ? null : currentPlayer(room).id;
            GameRoom.Player player = room.players.get(location.playerId);
            if (player == null || (player.session != null && !player.session.getId().equals(session.getId()))) return;
            player.connected = false;
            player.session = null;
            player.disconnectedAt = System.currentTimeMillis();
            if (explicit) {
                room.players.remove(player.id);
                reactionTimes.remove(player.id);
                room.eventText = player.nickname + "님이 방을 나갔어요";
                if (room.phase == GameRoom.Phase.PLAYING) player.eliminated = true;
            } else {
                room.eventText = player.nickname + "님 연결을 기다리는 중…";
            }
            if (player.id.equals(room.hostId) && explicit) {
                room.hostId = room.players.values().stream().filter(candidate -> !candidate.bot && candidate.connected)
                        .map(candidate -> candidate.id).findFirst().orElse(null);
            }
            if (room.players.values().stream().noneMatch(candidate -> !candidate.bot)) {
                rooms.remove(room.code);
            } else {
                if (room.phase == GameRoom.Phase.PLAYING && activePlayers(room).size() <= 1) finish(room);
                else if (explicit && room.phase == GameRoom.Phase.PLAYING) {
                    preserveTurnAfterRemoval(room, currentId, previousOrder);
                }
                broadcastState(room);
            }
        }
    }

    private void withPlayer(WebSocketSession session, PlayerAction action) {
        Location location = sessionLocations.get(session.getId());
        if (location == null) throw new GameProblem("JOIN_FIRST", "먼저 방에 들어가 주세요");
        GameRoom room = rooms.get(location.roomCode);
        if (room == null) throw new GameProblem("ROOM_CLOSED", "방이 닫혔어요");
        synchronized (room) {
            GameRoom.Player player = room.players.get(location.playerId);
            if (player == null) throw new GameProblem("PLAYER_GONE", "참가자 정보를 찾지 못했어요");
            if (player.session != session || !player.connected) throw new GameProblem("SESSION_REPLACED", "다른 연결에서 복귀했어요. 이 화면은 로비로 돌아가 주세요");
            action.run(room, player);
        }
    }

    private void tickSafely() {
        try {
            long now = System.currentTimeMillis();
            for (GameRoom room : new ArrayList<>(rooms.values())) {
                synchronized (room) {
                    cleanDisconnected(room, now);
                    if (room.phase == GameRoom.Phase.PLAYING) tickGame(room, now);
                    if (now - room.updatedAt > TimeUnit.HOURS.toMillis(2)) rooms.remove(room.code);
                }
            }
        } catch (Exception ignored) {
            // One malformed room must never stop the shared game clock.
        }
    }

    private void tickGame(GameRoom room, long now) {
        if (activePlayers(room).size() <= 1) {
            finish(room);
            broadcastState(room);
            return;
        }
        GameRoom.Player current = currentPlayer(room);
        if (current == null) {
            advanceTurn(room);
            broadcastState(room);
            return;
        }
        if (current.bot && now >= room.botActionAt) {
            if (room.difficulty.makesMistake(random)) {
                timeout(room, current, current.nickname + "이 단어를 놓쳤어요");
                broadcastState(room);
                return;
            }
            String word = dictionary.pick(room.requiredSyllable, room.mode, room.usedWords);
            if (word == null) botRhythmPass(room, current);
            else acceptWord(room, current, word);
            broadcastState(room);
            return;
        }
        if (now >= room.deadline) {
            timeout(room, current, current.nickname + "님, 박자를 놓쳤어요");
            broadcastState(room);
        }
    }

    private void botRhythmPass(GameRoom room, GameRoom.Player bot) {
        room.combo = 0;
        bot.streak = 0;
        room.requiredSyllable = dictionary.pickStarter(room.mode);
        room.eventText = bot.nickname + "의 리듬 패스! 새 글자는 ‘" + room.requiredSyllable + "’";
        advanceTurn(room);
    }

    private void timeout(GameRoom room, GameRoom.Player player, String message) {
        player.lives--;
        player.streak = 0;
        room.combo = 0;
        room.eventText = message;
        if (player.lives <= 0) player.eliminated = true;
        if (activePlayers(room).size() <= 1) finish(room);
        else advanceTurn(room);
    }

    private void finish(GameRoom room) {
        if (room.phase == GameRoom.Phase.FINISHED) return;
        room.phase = GameRoom.Phase.FINISHED;
        GameRoom.Player winner = activePlayers(room).stream().findFirst().orElseGet(() -> room.players.values().stream()
                .max(Comparator.comparingInt(player -> player.score)).orElse(null));
        if (winner != null) {
            winner.wins++;
            room.winnerId = winner.id;
            room.eventText = "🏆 " + winner.nickname + "님이 리듬 왕!";
        } else {
            room.eventText = "이번 판은 무승부예요";
        }
        room.deadline = 0;
        room.updatedAt = System.currentTimeMillis();
    }

    private void advanceTurn(GameRoom room) {
        List<GameRoom.Player> order = new ArrayList<>(room.players.values());
        if (order.isEmpty()) return;
        for (int step = 1; step <= order.size(); step++) {
            int next = (room.turnIndex + step) % order.size();
            GameRoom.Player candidate = order.get(next);
            if (!candidate.eliminated) {
                room.turnIndex = next;
                startTurn(room);
                return;
            }
        }
        finish(room);
    }

    private void startTurn(GameRoom room) {
        long now = System.currentTimeMillis();
        room.turnCount++;
        int turnSeconds = room.mode.turnSecondsForTurn(room.turnCount, room.combo >= 7);
        room.turnStartedAt = now;
        room.deadline = now + turnSeconds * 1000L;
        GameRoom.Player current = currentPlayer(room);
        room.botActionAt = current != null && current.bot ? now + room.difficulty.thinkMillis(random) : 0;
        room.updatedAt = now;
    }

    private GameRoom.Player currentPlayer(GameRoom room) {
        List<GameRoom.Player> order = new ArrayList<>(room.players.values());
        if (order.isEmpty()) return null;
        room.turnIndex = Math.floorMod(room.turnIndex, order.size());
        GameRoom.Player candidate = order.get(room.turnIndex);
        return !candidate.eliminated ? candidate : null;
    }

    private List<GameRoom.Player> activePlayers(GameRoom room) {
        return room.players.values().stream()
                .filter(player -> !player.eliminated).toList();
    }

    private void cleanDisconnected(GameRoom room, long now) {
        long grace = RECONNECT_GRACE_MS;
        List<String> previousOrder = new ArrayList<>(room.players.keySet());
        String currentId = currentPlayer(room) == null ? null : currentPlayer(room).id;
        List<String> stale = room.players.values().stream().filter(player -> !player.bot && !player.connected)
                .filter(player -> player.disconnectedAt > 0 && now - player.disconnectedAt > grace)
                .map(player -> player.id).toList();
        if (stale.isEmpty()) return;
        stale.forEach(id -> { room.players.remove(id); reactionTimes.remove(id); });
        if (room.hostId != null && !room.players.containsKey(room.hostId)) {
            room.hostId = room.players.values().stream().filter(player -> !player.bot && player.connected).map(player -> player.id).findFirst().orElse(null);
        }
        if (room.players.values().stream().noneMatch(player -> !player.bot)) { rooms.remove(room.code); return; }
        if (room.phase == GameRoom.Phase.PLAYING) preserveTurnAfterRemoval(room, currentId, previousOrder);
        broadcastState(room);
    }

    private void preserveTurnAfterRemoval(GameRoom room, String previousId, List<String> previousOrder) {
        if (activePlayers(room).size() <= 1) { finish(room); return; }
        List<GameRoom.Player> order = new ArrayList<>(room.players.values());
        for (int index = 0; index < order.size(); index++) {
            if (order.get(index).id.equals(previousId)) { room.turnIndex = index; return; }
        }
        int previousIndex = previousOrder.indexOf(previousId);
        for (int step = 1; step <= previousOrder.size(); step++) {
            String nextId = previousOrder.get(Math.floorMod(previousIndex + step, previousOrder.size()));
            GameRoom.Player next = room.players.get(nextId);
            if (next != null && !next.eliminated) {
                room.turnIndex = order.indexOf(next);
                startTurn(room);
                return;
            }
        }
        finish(room);
    }

    private void requireTimeRemaining(GameRoom room, GameRoom.Player player) {
        if (System.currentTimeMillis() >= room.deadline) {
            timeout(room, player, player.nickname + "님, 박자를 놓쳤어요");
            broadcastState(room);
            throw new GameProblem("TURN_EXPIRED", "제한 시간이 지났어요. 다음 차례에 이어주세요");
        }
    }

    private void requireCurrentTurn(GameRoom room, JsonNode message) {
        if ((message.has("round") && message.path("round").asInt(-1) != room.round)
                || (message.has("turnCount") && message.path("turnCount").asInt(-1) != room.turnCount)) {
            broadcastState(room);
            throw new GameProblem("STALE_TURN", "이미 다음 차례로 넘어갔어요. 현재 첫 글자를 확인해 주세요");
        }
    }

    private void requireUnassigned(WebSocketSession session) {
        if (sessionLocations.containsKey(session.getId())) {
            throw new GameProblem("ALREADY_IN_ROOM", "이미 입장했어요. 현재 방에서 나간 뒤 다시 시작해 주세요");
        }
    }

    private synchronized void registerRoom(GameRoom room) {
        if (rooms.size() >= MAX_ROOMS) throw new GameProblem("SERVER_BUSY", "현재 열린 방이 많아요. 잠시 뒤 다시 시작해 주세요");
        if (rooms.putIfAbsent(room.code, room) != null) throw new GameProblem("SERVER_BUSY", "방 생성이 겹쳤어요. 다시 시작해 주세요");
    }

    private void requireHost(GameRoom room, GameRoom.Player requester) {
        if (!requester.id.equals(room.hostId)) throw new GameProblem("HOST_ONLY", "방장만 할 수 있어요");
    }

    private void requirePlaying(GameRoom room) {
        if (room.phase != GameRoom.Phase.PLAYING) throw new GameProblem("NOT_PLAYING", "게임이 시작되지 않았어요");
    }

    private void broadcastState(GameRoom room) {
        broadcast(room, state(room));
    }

    private Map<String, Object> state(GameRoom room) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", "state");
        result.put("serverTime", System.currentTimeMillis());
        result.put("roomCode", room.code);
        result.put("matchType", room.duelQueue ? "duel" : "room");
        result.put("maxPlayers", room.duelQueue ? 2 : MAX_PLAYERS);
        result.put("phase", room.phase.name().toLowerCase(Locale.ROOT));
        result.put("hostId", room.hostId);
        int effectiveSeconds = room.phase == GameRoom.Phase.PLAYING
                ? room.mode.turnSecondsForTurn(room.turnCount, room.combo >= 7)
                : room.mode.turnSeconds();
        result.put("mode", Map.of("id", room.mode.id(), "label", room.mode.label(), "length", room.mode.lengthText(),
                "turnSeconds", room.mode.turnSeconds(), "currentTurnSeconds", effectiveSeconds,
                "tempoStage", Math.max(0, (room.turnCount - 1) / 3)));
        result.put("difficulty", Map.of("id", room.difficulty.id(), "label", room.difficulty.label(), "description", room.difficulty.description()));
        result.put("players", room.players.values().stream().map(player -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", player.id);
            item.put("nickname", player.nickname);
            item.put("mascot", player.mascot);
            item.put("bot", player.bot);
            item.put("connected", player.connected);
            item.put("eliminated", player.eliminated);
            item.put("score", player.score);
            item.put("lives", player.lives);
            item.put("streak", player.streak);
            item.put("wins", player.wins);
            item.put("hints", player.hintsRemaining);
            item.put("wordsPlayed", player.wordsPlayed);
            item.put("host", player.id.equals(room.hostId));
            return item;
        }).toList());
        GameRoom.Player current = room.phase == GameRoom.Phase.PLAYING ? currentPlayer(room) : null;
        result.put("turnPlayerId", current == null ? null : current.id);
        result.put("requiredSyllable", room.requiredSyllable);
        result.put("lastWord", room.lastWord);
        result.put("combo", room.combo);
        result.put("feverTarget", 7);
        result.put("fever", room.combo >= 7);
        result.put("round", room.round);
        result.put("roundId", room.roundId);
        result.put("turnCount", room.turnCount);
        result.put("deadline", room.deadline);
        result.put("winnerId", room.winnerId);
        result.put("eventText", room.eventText);
        result.put("history", room.history.stream().skip(Math.max(0, room.history.size() - 12L)).map(play ->
                Map.of("playerId", play.playerId(), "nickname", play.nickname(), "word", play.word(),
                        "points", play.points(), "at", play.at())).toList());
        return result;
    }

    private void broadcast(GameRoom room, Map<String, Object> message) {
        String payload;
        try {
            payload = json.writeValueAsString(message);
        } catch (Exception exception) {
            return;
        }
        room.players.values().stream().filter(player -> !player.bot && player.connected && player.session != null)
                .forEach(player -> sendText(player.session, payload));
    }

    private void send(WebSocketSession session, Map<String, Object> message) {
        try {
            sendText(session, json.writeValueAsString(message));
        } catch (Exception ignored) {
        }
    }

    private void sendText(WebSocketSession session, String payload) {
        if (session == null || !session.isOpen()) return;
        try {
            synchronized (session) {
                if (session.isOpen()) session.sendMessage(new TextMessage(payload));
            }
        } catch (IOException | IllegalStateException ignored) {
            // The transport can close between isOpen() and sendMessage().
            // One departing peer must not abort the broadcast to everyone else.
        }
    }

    private void sendError(WebSocketSession session, String code, String message) {
        send(session, Map.of("type", "error", "code", code, "message", message));
    }

    private String resolvePlayerId(WebSocketSession session, String requested) {
        String codersUser = session.getHandshakeHeaders().getFirst("X-Coders-User");
        if (codersUser != null && codersUser.matches("[0-9a-fA-F-]{16,64}")) return "user-" + codersUser;
        if (requested != null && requested.matches("[A-Za-z0-9_-]{8,80}")) return requested;
        return "guest-" + UUID.randomUUID();
    }

    private String cleanNickname(String value) {
        if (!AllowedNicknames.contains(value) || ContentSafety.isBlocked(value)) {
            throw new GameProblem("INVALID_NICKNAME", "준비된 별명 중에서 골라 주세요");
        }
        return value;
    }

    private String newCode() {
        for (int attempt = 0; attempt < 100; attempt++) {
            StringBuilder code = new StringBuilder(5);
            for (int index = 0; index < 5; index++) code.append(CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)]);
            if (!rooms.containsKey(code.toString())) return code.toString();
        }
        return UUID.randomUUID().toString().substring(0, 5).toUpperCase(Locale.ROOT);
    }

    private static String normalizeCode(String code) {
        return code == null ? "" : code.strip().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? "" : value.asText();
    }

    @PreDestroy
    public void shutdown() {
        ticker.shutdownNow();
    }

    private record Location(String roomCode, String playerId) { }

    @FunctionalInterface
    private interface PlayerAction { void run(GameRoom room, GameRoom.Player player); }

    private static final class GameProblem extends RuntimeException {
        final String code;
        GameProblem(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}
