package com.hackspain.api.item;

import com.hackspain.api.common.NotFoundException;
import com.hackspain.api.item.ItemDto.CreateItemRequest;
import com.hackspain.api.item.ItemDto.UpdateItemRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ItemService {

    private final ItemRepository itemRepository;

    public ItemService(ItemRepository itemRepository) {
        this.itemRepository = itemRepository;
    }

    public Page<Item> list(Pageable pageable) {
        return itemRepository.findAll(pageable);
    }

    public Item get(UUID id) {
        return itemRepository.findById(id)
                .orElseThrow(() -> NotFoundException.forId("Item", id));
    }

    @Transactional
    public Item create(CreateItemRequest request) {
        Item item = new Item(
                UUID.randomUUID(),
                request.title(),
                request.description(),
                false,
                Instant.now());
        return itemRepository.save(item);
    }

    @Transactional
    public Item update(UUID id, UpdateItemRequest request) {
        Item item = get(id);
        item.setTitle(request.title());
        item.setDescription(request.description());
        item.setDone(request.done());
        return itemRepository.save(item);
    }

    @Transactional
    public void delete(UUID id) {
        if (!itemRepository.existsById(id)) {
            throw NotFoundException.forId("Item", id);
        }
        itemRepository.deleteById(id);
    }
}
