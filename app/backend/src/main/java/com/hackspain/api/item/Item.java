package com.hackspain.api.item;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Sample entity. This is the pattern to copy when you add a real one:
 * an entity, a repository, a service, a controller, and DTOs.
 *
 * Rename recipe (see CHEATSHEET.md): copy this package to a new name,
 * find-and-replace "Item"/"item" with your entity name, then add the
 * matching zod schema in packages/shared/src/schemas.ts.
 */
@Entity
@Table(name = "items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Item {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(length = 2000)
    private String description;

    @Column(nullable = false)
    private boolean done;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;
}
