package com.hackspain.api;

import com.hackspain.api.item.Item;
import com.hackspain.api.item.ItemRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

/**
 * Inserts five demo items on every startup, but only when the table is
 * empty. Delete this class once you replace Item with real domain data.
 */
@Component
public class DataSeeder implements CommandLineRunner {

    private final ItemRepository itemRepository;

    public DataSeeder(ItemRepository itemRepository) {
        this.itemRepository = itemRepository;
    }

    @Override
    public void run(String... args) {
        if (itemRepository.count() > 0) {
            return;
        }
        String[] titles = {
                "Set up the demo",
                "Wire the mobile app to the API",
                "Pick the challenge track",
                "Build the pitch deck",
                "Sleep before the deadline"
        };
        for (String title : titles) {
            itemRepository.save(new Item(
                    UUID.randomUUID(), title, "Seeded demo item", false, Instant.now()));
        }
    }
}
