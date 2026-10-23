package in.jalachaya.backend.pond;

import java.math.BigDecimal;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PondRequest(
        @NotBlank @Size(min = 3, max = 150) String name,
        @NotBlank @Size(max = 100) String ward,
        @Size(max = 150) String village,
        @DecimalMin(value = "0", inclusive = false) BigDecimal areaAcres,
        @NotNull @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
        @NotNull @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
        @Size(max = 4000) String description) {}
