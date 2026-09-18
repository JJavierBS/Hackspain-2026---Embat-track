package com.hackspain.api.common;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Flattens a Spring Data {@link Page} into a stable JSON shape that does
 * not change if the Spring Data pagination format changes across versions.
 * {@code pageSchema()} in packages/shared/src/schemas.ts mirrors this
 * record field for field.
 */
public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalItems,
        int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
