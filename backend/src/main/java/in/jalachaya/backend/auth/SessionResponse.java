package in.jalachaya.backend.auth;

import in.jalachaya.backend.user.Role;

public record SessionResponse(String token, Role role, Long userId, String name) {}
