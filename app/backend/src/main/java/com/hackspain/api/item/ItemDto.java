package com.hackspain.api.item;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/**
 * Request and response records for the item endpoints. Each shape here
 * has a matching zod schema in packages/shared/src/schemas.ts. Keep the
 * two in step when you change a field.
 */
public class ItemDto {

    public record ItemResponse(
            UUID id,
            String title,
            String description,
            boolean done,
            Instant createdAt) {

        public static ItemResponse from(Item item) {
            return new ItemResponse(
                    item.getId(), item.getTitle(), item.getDescription(),
                    item.isDone(), item.getCreatedAt());
        }
    }

    public record CreateItemRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 2000) String description) {
    }

    public record UpdateItemRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 2000) String description,
            boolean done) {
    }
}
