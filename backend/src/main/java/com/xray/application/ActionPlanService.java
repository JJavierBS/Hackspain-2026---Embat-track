package com.xray.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.xray.config.HelmcodeProperties;
import com.xray.infrastructure.web.dto.ActionPlanDto;
import com.xray.infrastructure.web.dto.ActionPlanRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Service
public class ActionPlanService {

    private static final Logger log = LoggerFactory.getLogger(ActionPlanService.class);
    private final HelmcodeProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient client;

    public ActionPlanService(HelmcodeProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    }

    public ActionPlanDto generate(ActionPlanRequest request) {
        validate(request);
        ActionPlanDto fallback = fallback(request);
        if (!properties.enabled() || properties.apiKey().isBlank()) {
            return fallback;
        }
        try {
            return callHelmcode(request, fallback);
        } catch (Exception e) {
            log.warn("Helmcode action plan unavailable: {}", e.getMessage());
            return fallback;
        }
    }

    private ActionPlanDto callHelmcode(ActionPlanRequest request, ActionPlanDto fallback) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", properties.model());
        body.put("temperature", 0.2);
        body.put("max_tokens", 1400);
        ArrayNode messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", "You are a cautious SME treasury advisor. Return only valid JSON with keys objective, diagnosis, risks, summary and steps. Build a decision-ready plan, not a restatement of the recommendations. Explain the interaction between score, trend, alerts and indicators. Each step must have phase, priority, title, why, action, firstStep, timeframe, owner and metric. Use Spanish. Make the steps sequential across 7 days, 30 days and 90 days where the data supports it. State uncertainty when data is missing. Never invent numbers, facts, or guarantees. Base every statement on the supplied entity context.");
        messages.addObject().put("role", "user").put("content", mapper.writeValueAsString(request));

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(properties.baseUrl().replaceAll("/$", "") + "/chat/completions"))
                .timeout(Duration.ofSeconds(25))
                .header("Authorization", "Bearer " + properties.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("provider returned HTTP " + response.statusCode());
        }
        JsonNode content = mapper.readTree(response.body()).path("choices").path(0).path("message").path("content");
        if (!content.isTextual()) {
            throw new IllegalStateException("provider response has no message content");
        }
        String json = content.textValue().replaceAll("^```(?:json)?\\s*|\\s*```$", "").trim();
        JsonNode plan = mapper.readTree(json);
        List<ActionPlanDto.ActionStepDto> steps = new ArrayList<>();
        for (JsonNode step : plan.path("steps")) {
            steps.add(new ActionPlanDto.ActionStepDto(
                    text(step, "phase", "Ejecutar"), text(step, "priority", "MEDIUM"),
                    text(step, "title", "Revisar prioridad"), text(step, "why", "Esta prioridad está afectando a la salud financiera."),
                    text(step, "action", "Definir una acción y un responsable."), text(step, "firstStep", "Asignar un responsable hoy."),
                    text(step, "timeframe", "Próximos 30 días"), text(step, "owner", "Dirección financiera"),
                    text(step, "metric", "Indicador seleccionado")));
        }
        if (steps.isEmpty()) {
            throw new IllegalStateException("provider returned no steps");
        }
        return new ActionPlanDto("HELMcode", text(plan, "objective", fallback.objective()),
            text(plan, "diagnosis", fallback.diagnosis()), strings(plan.path("risks"), fallback.risks()),
            text(plan, "summary", fallback.summary()), steps);
    }

    private ActionPlanDto fallback(ActionPlanRequest request) {
        List<ActionPlanDto.ActionStepDto> steps = request.recommendations().stream().limit(3).map(r ->
            new ActionPlanDto.ActionStepDto("Contener", r.level() < 40 ? "HIGH" : "MEDIUM", r.title(),
                "El nivel actual indica que esta prioridad necesita seguimiento.", r.action(),
                "Asignar un responsable y confirmar el dato con el equipo financiero.",
                r.level() < 40 ? "Próximos 7 días" : "Próximos 30 días", "Dirección financiera", r.indicator())).toList();
        return new ActionPlanDto("RULES", "Recuperar las prioridades financieras más débiles.",
                "La entidad requiere atención sobre sus indicadores con menor nivel; el plan debe confirmarse con el equipo financiero.",
                request.changes() == null || request.changes().isEmpty() ? List.of("La información disponible no permite identificar riesgos adicionales.") : request.changes(),
            "Plan generado a partir de las prioridades financieras detectadas.", steps);
    }

    private static List<String> strings(JsonNode node, List<String> fallback) {
        if (!node.isArray()) return fallback;
        List<String> out = new ArrayList<>();
        node.forEach(value -> { if (value.isTextual() && !value.textValue().isBlank()) out.add(value.textValue()); });
        return out.isEmpty() ? fallback : out.stream().limit(4).toList();
    }

    private static String text(JsonNode node, String field, String fallback) {
        JsonNode value = node.path(field);
        return value.isTextual() && !value.textValue().isBlank() ? value.textValue() : fallback;
    }

    private static void validate(ActionPlanRequest request) {
        if (request == null || request.recommendations() == null || request.recommendations().isEmpty()) {
            throw new BadRequestException("Se necesita al menos una recomendación para generar el plan");
        }
        if (request.recommendations().size() > 3) {
            throw new BadRequestException("El plan admite como máximo tres recomendaciones");
        }
    }
}
