package in.jalachaya.backend.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Size(min = 3, max = 150) String name,
        @NotBlank @Email String email,
        @Pattern(regexp = "^$|^[0-9]{10}$", message = "must be a 10-digit number") String phone,
        String ward,
        @NotBlank @Size(min = 6) String password) {}
