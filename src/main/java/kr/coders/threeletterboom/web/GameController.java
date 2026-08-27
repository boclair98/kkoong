package kr.coders.threeletterboom.web;

import kr.coders.threeletterboom.game.RoomService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api")
public class GameController {
    private final RoomService rooms;

    public GameController(RoomService rooms) {
        this.rooms = rooms;
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
}
