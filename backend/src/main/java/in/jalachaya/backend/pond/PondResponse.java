package in.jalachaya.backend.pond;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

public record PondResponse(
        Long id, String name, String ward, String village, BigDecimal areaAcres,
        BigDecimal latitude, BigDecimal longitude, String description, String imageUrl,
        boolean active, Instant createdAt, int totalComplaints, int activeComplaints,
        int resolvedComplaints, Integer recoveryPercent, List<?> timeline) {
    public static PondResponse from(Pond pond, int total, int active, int resolved,
                                    Integer recovery, List<?> timeline) {
        return new PondResponse(pond.getId(), pond.getName(), pond.getWard(), pond.getVillage(),
                pond.getAreaAcres(), pond.getLatitude(), pond.getLongitude(), pond.getDescription(),
                pond.getImagePath(), pond.isActive(), pond.getCreatedAt().atOffset(ZoneOffset.UTC).toInstant(),
                total, active, resolved, recovery, timeline);
    }
}
