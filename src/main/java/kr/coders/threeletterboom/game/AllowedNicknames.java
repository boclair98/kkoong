package kr.coders.threeletterboom.game;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Only these pre-reviewed display names may be shown to other players. */
final class AllowedNicknames {
    private static final List<String> NAMES = createNames();
    private static final Set<String> LOOKUP = Set.copyOf(NAMES);

    private AllowedNicknames() { }

    static boolean contains(String name) {
        return name != null && LOOKUP.contains(name);
    }

    static List<String> all() {
        return NAMES;
    }

    private static List<String> createNames() {
        List<String> names = new ArrayList<>();
        for (String prefix : List.of("별빛", "은하", "달빛", "혜성", "우주", "반짝")) {
            for (String role : List.of("탐험가", "항해사", "파일럿", "연구원")) {
                names.add(prefix + role);
            }
        }
        return List.copyOf(names);
    }
}
