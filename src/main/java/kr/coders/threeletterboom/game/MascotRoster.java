package kr.coders.threeletterboom.game;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Random;

/** Stable cosmetic IDs shared with static/crew-catalog.js. Never reuse an occupied ID. */
final class MascotRoster {
    static final int SIZE = 24;

    private MascotRoster() { }

    static int choose(GameRoom room, String playerId, int preferred, Random random) {
        var occupied = new HashSet<Integer>();
        room.players.values().stream().filter(player -> !player.id.equals(playerId))
                .forEach(player -> occupied.add(player.mascot));
        if (preferred >= 0 && preferred < SIZE && !occupied.contains(preferred)) return preferred;
        var available = new ArrayList<Integer>();
        for (int id = 0; id < SIZE; id++) if (!occupied.contains(id)) available.add(id);
        if (available.isEmpty()) throw new IllegalStateException("No free cosmetic slot");
        return available.get(random.nextInt(available.size()));
    }
}
