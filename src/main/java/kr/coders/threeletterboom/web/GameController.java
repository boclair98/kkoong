package kr.coders.threeletterboom.web;

import kr.coders.threeletterboom.game.RoomService;
import kr.coders.threeletterboom.game.WordDictionary;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api")
public class GameController {
    private final RoomService rooms;
    private final WordDictionary dictionary;

    public GameController(RoomService rooms, WordDictionary dictionary) {
        this.rooms = rooms;
        this.dictionary = dictionary;
    }

    @GetMapping("/lobby")
    public ResponseEntity<Map<String, Object>> lobby() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(2, TimeUnit.SECONDS).cachePublic())
                .body(Map.of("rooms", rooms.lobbyRooms(), "stats", rooms.publicStats(), "serverTime", System.currentTimeMillis()));
    }

    @GetMapping("/ready")
    public Map<String, Object> ready() {
        return Map.of("status", "ready", "service", "three-letter-boom");
    }

    @GetMapping("/word/check")
    public Map<String, Object> checkWord(@RequestParam(defaultValue = "") String word) {
        String normalized = WordDictionary.normalize(word);
        boolean hangul = WordDictionary.isHangulWord(normalized);
        return Map.of("word", normalized, "known", hangul && dictionary.isKnown(normalized),
                "hangul", hangul, "length", normalized.length());
    }
}
