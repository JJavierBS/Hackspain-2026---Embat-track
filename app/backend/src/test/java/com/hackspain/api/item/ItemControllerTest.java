package com.hackspain.api.item;

import com.hackspain.api.item.ItemDto.CreateItemRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Proves the JSON contract for /api/items without touching a database.
 * The service is mocked, so this runs in well under a second.
 */
@WebMvcTest(ItemController.class)
class ItemControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private ItemService itemService;

    @Test
    void listReturnsSeededItems() throws Exception {
        Item item = new Item(UUID.randomUUID(), "Ship the demo", "desc", false, Instant.now());
        when(itemService.list(any())).thenReturn(new PageImpl<>(List.of(item), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].title").value("Ship the demo"))
                .andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    void getUnknownIdReturns404() throws Exception {
        UUID missing = UUID.randomUUID();
        when(itemService.get(missing)).thenThrow(
                com.hackspain.api.common.NotFoundException.forId("Item", missing));

        mockMvc.perform(get("/api/items/{id}", missing))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsBlankTitle() throws Exception {
        CreateItemRequest invalid = new CreateItemRequest("", null);

        mockMvc.perform(post("/api/items")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest());
    }
}
