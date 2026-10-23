package in.jalachaya.backend.pond;

import java.io.IOException;
import java.io.InputStream;
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
public class PondImageStore {
    private static final Logger log = LoggerFactory.getLogger(PondImageStore.class);
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final String PREFIX = "/uploads/ponds/";
    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp");
    private final Path directory;

    public PondImageStore(@Value("${app.upload-dir}") String uploadDir) {
        this.directory = Path.of(uploadDir).toAbsolutePath().normalize().resolve("ponds");
    }

    public Path directory() { return directory; }

    public String store(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose a photo.");
        }
        if (image.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The upload is too large.");
        }
        String extension = EXTENSIONS.get(image.getContentType());
        if (extension == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only JPG, PNG, or WEBP images are allowed.");
        }
        try (InputStream input = image.getInputStream()) {
            byte[] bytes = input.readAllBytes();
            if (bytes.length > MAX_BYTES || !matchesSignature(bytes, extension)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file is not a valid image.");
            }
            Files.createDirectories(directory);
            String name = UUID.randomUUID() + extension;
            Path target = directory.resolve(name);
            Files.write(target, bytes, StandardOpenOption.CREATE_NEW);
            return PREFIX + name;
        } catch (IOException exception) {
            log.error("Could not save pond image", exception);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not save the photo.");
        }
    }

    public void remove(String imagePath) {
        if (imagePath == null || !imagePath.startsWith(PREFIX)) return;
        String name = imagePath.substring(PREFIX.length());
        if (!name.matches("[a-f0-9-]{36}\\.(jpg|png|webp)")) return;
        try {
            Files.deleteIfExists(directory.resolve(name));
        } catch (IOException exception) {
            log.warn("Could not remove old pond image {}", imagePath, exception);
        }
    }

    private boolean matchesSignature(byte[] bytes, String extension) {
        if (extension.equals(".jpg")) {
            return bytes.length >= 3 && (bytes[0] & 0xff) == 0xff
                    && (bytes[1] & 0xff) == 0xd8 && (bytes[2] & 0xff) == 0xff;
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
