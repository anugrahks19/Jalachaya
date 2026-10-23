package in.jalachaya.backend.pond;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class PondController {
    private final PondService ponds;
    private final ObjectMapper mapper;

    public PondController(PondService ponds, ObjectMapper mapper) {
        this.ponds = ponds;
        this.mapper = mapper;
    }

    @GetMapping("/api/public/ponds")
    public List<PondResponse> publicPonds() { return ponds.publicPonds(); }

    @GetMapping("/api/public/ponds/{id}")
    public PondResponse publicPond(@PathVariable long id) { return ponds.publicPond(id); }

    @GetMapping("/api/ponds")
    public List<PondResponse> officerPonds() { return ponds.officerPonds(); }

    @GetMapping("/api/ponds/{id}")
    public PondResponse officerPond(@PathVariable long id) { return ponds.officerPond(id); }

    @PostMapping("/api/ponds")
    public PondResponse create(@Valid @RequestBody PondRequest request) { return ponds.create(request); }

    @PutMapping("/api/ponds/{id}")
    public PondResponse update(@PathVariable long id, @RequestBody JsonNode body) {
        if (body.size() == 1 && body.has("active")) {
            if (!body.get("active").isBoolean()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "active must be true or false.");
            }
            return ponds.setActive(id, body.get("active").asBoolean());
        }
        try {
            return ponds.update(id, mapper.treeToValue(body, PondRequest.class));
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid pond details.");
        }
    }

    @PostMapping("/api/ponds/{id}/image")
    public PondResponse uploadImage(@PathVariable long id, @RequestParam MultipartFile image) {
        return ponds.uploadImage(id, image);
    }

    @DeleteMapping("/api/ponds/{id}/image")
    public PondResponse removeImage(@PathVariable long id) { return ponds.removeImage(id); }
}
