package in.jalachaya.backend.problem;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Component
public class ProblemImageStore {
    private static final Logger log = LoggerFactory.getLogger(ProblemImageStore.class);
    private static final String PREFIX = "/uploads/problems/";
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp");
    private final Path directory;

    public ProblemImageStore(@Value("${app.upload-dir}") String uploadDir) {
        directory = Path.of(uploadDir).toAbsolutePath().normalize().resolve("problems");
    }

    public Path directory() { return directory; }

    public String store(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose a photo.");
        }
        if (image.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Each photo must be at most 5 MB.");
        }
        String extension = EXTENSIONS.get(image.getContentType());
        if (extension == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only JPG, PNG, or WEBP images are allowed.");
        }
        try {
            byte[] bytes = image.getBytes();
            if (bytes.length > MAX_BYTES || !matchesSignature(bytes, extension)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file is not a valid image.");
            }
            Files.createDirectories(directory);
            String name = UUID.randomUUID() + extension;
            Files.write(directory.resolve(name), bytes, StandardOpenOption.CREATE_NEW);
            return PREFIX + name;
        } catch (IOException exception) {
            log.error("Could not save complaint photo", exception);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not save the photo.");
        }
    }

    public void remove(String path) {
        if (path == null || !path.startsWith(PREFIX)) return;
        String name = path.substring(PREFIX.length());
        if (!name.matches("[a-f0-9-]{36}\\.(jpg|png|webp)")) return;
        try {
            Files.deleteIfExists(directory.resolve(name));
        } catch (IOException exception) {
            log.warn("Could not remove complaint photo {}", path, exception);
        }
    }

    private boolean matchesSignature(byte[] bytes, String extension) {
        if (extension.equals(".jpg")) {
            return bytes.length >= 3 && (bytes[0] & 255) == 255
                    && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
        }
        if (extension.equals(".png")) {
            byte[] png = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
            if (bytes.length < png.length) return false;
            for (int i = 0; i < png.length; i++) if (bytes[i] != png[i]) return false;
            return true;
        }
        return bytes.length >= 12 && new String(bytes, 0, 4).equals("RIFF")
                && new String(bytes, 8, 4).equals("WEBP");
    }
}
