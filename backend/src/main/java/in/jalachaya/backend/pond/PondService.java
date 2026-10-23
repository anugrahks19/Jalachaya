package in.jalachaya.backend.pond;

import in.jalachaya.backend.problem.ProblemService;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PondService {
    private final in.jalachaya.backend.common.DataScope scope;
    private final PondRepository ponds;
    private final PondImageStore images;
    private final Validator validator;
    private final ProblemService problems;

    public PondService(PondRepository ponds, PondImageStore images, Validator validator, ProblemService problems, in.jalachaya.backend.common.DataScope scope) {
        this.scope = scope;
        this.ponds = ponds;
        this.images = images;
        this.validator = validator;
        this.problems = problems;
    }

    @Transactional(readOnly = true)
    public List<PondResponse> publicPonds() {
        return ponds.findByActiveTrueOrderByNameAsc().stream().filter(p -> p.isDemo() == scope.currentDemo()).map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public PondResponse publicPond(long id) {
        scope.requirePond(id, scope.currentDemo());
        Pond pond = get(id);
        if (!pond.isActive()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pond not found.");
        return response(pond);
    }

    @Transactional(readOnly = true)
    public List<PondResponse> officerPonds() {
        return ponds.findAllByOrderByNameAsc().stream().filter(p -> p.isDemo() == scope.currentDemo()).map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public PondResponse officerPond(long id) {
        return response(get(id));
    }

    @Transactional
    public PondResponse create(PondRequest request) {
        return createScoped(request, scope.currentDemo());
    }

    @Transactional
    public PondResponse createDemo(PondRequest request) { return createScoped(request, true); }

    private PondResponse createScoped(PondRequest request, boolean demo) {
        validate(request);
        Pond pond = new Pond();
        pond.setDemo(demo);
        apply(pond, request);
        ensureUnique(pond);
        try {
            return response(ponds.saveAndFlush(pond));
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A pond with this name already exists in this ward.");
        }
    }

    @Transactional
    public PondResponse update(long id, PondRequest request) {
        validate(request);
        Pond pond = get(id);
        apply(pond, request);
        ensureUnique(pond);
        try {
            return response(ponds.saveAndFlush(pond));
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A pond with this name already exists in this ward.");
        }
    }

    @Transactional
    public PondResponse setActive(long id, boolean active) {
        Pond pond = get(id);
        if (!active && problems.hasOpenProblems(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A pond with open complaints cannot be deactivated.");
        }
        pond.setActive(active);
        return response(ponds.saveAndFlush(pond));
    }

    @Transactional
    public PondResponse uploadImage(long id, MultipartFile image) {
        Pond pond = get(id);
        String newPath = images.store(image);
        String oldPath = pond.getImagePath();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() { images.remove(oldPath); }
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) images.remove(newPath);
            }
        });
        pond.setImagePath(newPath);
        return response(ponds.saveAndFlush(pond));
    }

    @Transactional
    public PondResponse removeImage(long id) {
        Pond pond = get(id);
        String oldPath = pond.getImagePath();
        pond.setImagePath(null);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() { images.remove(oldPath); }
        });
        return response(ponds.saveAndFlush(pond));
    }

    private PondResponse response(Pond pond) {
        var stats = problems.pondStats(pond.getId());
        return PondResponse.from(pond, (Integer) stats.get("totalComplaints"),
                (Integer) stats.get("activeComplaints"), (Integer) stats.get("resolvedComplaints"),
                (Integer) stats.get("recoveryPercent"), problems.pondTimeline(pond.getId()));
    }

    private Pond get(long id) {
        if (scope.authenticated()) scope.requirePond(id, scope.currentDemo());
        return ponds.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Pond not found."));
    }

    private void validate(PondRequest request) {
        var violations = validator.validate(request);
        if (!violations.isEmpty()) {
            String message = violations.stream().map(ConstraintViolation::getMessage)
                    .collect(Collectors.joining("; "));
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        if (request.name().trim().length() < 3 || request.ward().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pond name and ward are required.");
        }
    }

    private void apply(Pond pond, PondRequest request) {
        pond.setName(request.name().trim());
        pond.setWard(request.ward().trim());
        pond.setVillage(trimOrNull(request.village()));
        pond.setAreaAcres(request.areaAcres());
        pond.setLatitude(request.latitude());
        pond.setLongitude(request.longitude());
        pond.setDescription(trimOrNull(request.description()));
    }

    private String trimOrNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void ensureUnique(Pond pond) {
        ponds.findByNameIgnoreCaseAndWardIgnoreCaseAndDemo(pond.getName(), pond.getWard(), pond.isDemo())
                .filter(existing -> !existing.getId().equals(pond.getId()))
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "A pond with this name already exists in " + pond.getWard() + ".");
                });
    }
}
