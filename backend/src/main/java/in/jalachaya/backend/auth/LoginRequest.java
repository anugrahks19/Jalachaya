package in.jalachaya.backend.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import in.jalachaya.backend.user.Role;

public record LoginRequest(@NotBlank @Email String email, @NotBlank String password, Role role, String team) {}
