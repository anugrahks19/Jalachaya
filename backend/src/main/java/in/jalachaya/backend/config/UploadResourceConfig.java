package in.jalachaya.backend.config;

import in.jalachaya.backend.pond.PondImageStore;
import in.jalachaya.backend.problem.ProblemImageStore;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class UploadResourceConfig implements WebMvcConfigurer {
    private final PondImageStore images;
    private final ProblemImageStore problemImages;

    public UploadResourceConfig(PondImageStore images, ProblemImageStore problemImages) {
        this.images = images;
        this.problemImages = problemImages;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/ponds/**")
                .addResourceLocations(images.directory().toUri().toString() + "/");
        registry.addResourceHandler("/uploads/problems/**")
                .addResourceLocations(problemImages.directory().toUri().toString() + "/");
    }
}
