package kr.coders.threeletterboom.game;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MascotRosterTests {
    @Test
    void eightPeopleRequestingTheSameCharacterReceiveUniqueAppearances() {
        GameRoom room = new GameRoom("CREW8", GameMode.CLASSIC);
        Random random = new Random(42);
        var assigned = new HashSet<Integer>();
        for (int i = 0; i < 8; i++) {
            GameRoom.Player player = new GameRoom.Player("guest-roster-" + i, "테스터", false, 2, null);
            player.mascot = MascotRoster.choose(room, player.id, 23, random);
            room.players.put(player.id, player);
            assertTrue(assigned.add(player.mascot));
            if (i == 0) assertEquals(23, player.mascot);
        }
        assertEquals(8, assigned.size());
    }

    @Test
    void botsNeverTakeAHumanOrOtherBotsCharacter() {
        GameRoom room = new GameRoom("BOTS8", GameMode.CLASSIC);
        Random random = new Random(17);
        GameRoom.Player human = new GameRoom.Player("guest-human", "탐사대", false, 2, null);
        human.mascot = 5;
        room.players.put(human.id, human);
        var assigned = new HashSet<Integer>();
        assigned.add(5);
        for (int i = 0; i < 7; i++) {
            GameRoom.Player bot = new GameRoom.Player("bot-" + i, "쿵봇", true, 2, null);
            bot.mascot = MascotRoster.choose(room, bot.id, -1, random);
            room.players.put(bot.id, bot);
            assertTrue(assigned.add(bot.mascot));
        }
    }

    @Test
    void boundsInvalidIdsAndCanReuseAnExplicitlyVacatedCharacter() {
        GameRoom room = new GameRoom("BOUND", GameMode.CLASSIC);
        Random random = new Random(10);
        for (int invalid : new int[] {-1, -999, 24, Integer.MAX_VALUE}) {
            int id = MascotRoster.choose(room, "guest", invalid, random);
            assertTrue(id >= 0 && id < MascotRoster.SIZE);
        }
        GameRoom.Player player = new GameRoom.Player("guest", "탐사대", false, 2, null);
        player.mascot = 7; room.players.put(player.id, player);
        assertFalse(MascotRoster.choose(room, "other", 7, random) == 7);
        assertEquals(7, MascotRoster.choose(room, player.id, 7, random));
        room.players.remove(player.id);
        assertEquals(7, MascotRoster.choose(room, "other", 7, random));
    }
}
