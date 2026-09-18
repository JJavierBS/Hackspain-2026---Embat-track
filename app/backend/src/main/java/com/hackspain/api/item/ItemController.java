package com.hackspain.api.item;

import com.hackspain.api.common.PageResponse;
import com.hackspain.api.item.ItemDto.CreateItemRequest;
import com.hackspain.api.item.ItemDto.ItemResponse;
import com.hackspain.api.item.ItemDto.UpdateItemRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/items")
public class ItemController {

    private final ItemService itemService;

    public ItemController(ItemService itemService) {
        this.itemService = itemService;
    }

    @GetMapping
    public PageResponse<ItemResponse> list(Pageable pageable) {
        return PageResponse.from(itemService.list(pageable).map(ItemResponse::from));
    }

    @GetMapping("/{id}")
    public ItemResponse get(@PathVariable UUID id) {
        return ItemResponse.from(itemService.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ItemResponse create(@Valid @RequestBody CreateItemRequest request) {
        return ItemResponse.from(itemService.create(request));
    }

    @PutMapping("/{id}")
    public ItemResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateItemRequest request) {
        return ItemResponse.from(itemService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        itemService.delete(id);
    }
}
