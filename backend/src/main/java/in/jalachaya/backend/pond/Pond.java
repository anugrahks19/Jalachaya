package in.jalachaya.backend.pond;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "ponds")
public class Pond {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(nullable = false, length = 100)
    private String ward;

    @Column(length = 150)
    private String village;

    @Column(name = "area_acres", precision = 10, scale = 2)
    private BigDecimal areaAcres;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "image_path", length = 500)
    private String imagePath;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "is_demo", nullable = false)
    private boolean demo;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void beforeInsert() {
        if (createdAt == null) createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getWard() { return ward; }
    public String getVillage() { return village; }
    public BigDecimal getAreaAcres() { return areaAcres; }
    public BigDecimal getLatitude() { return latitude; }
    public BigDecimal getLongitude() { return longitude; }
    public String getDescription() { return description; }
    public String getImagePath() { return imagePath; }
    public boolean isActive() { return active; }
    public boolean isDemo() { return demo; }
    public void setDemo(boolean demo) { this.demo = demo; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public void setName(String name) { this.name = name; }
    public void setWard(String ward) { this.ward = ward; }
    public void setVillage(String village) { this.village = village; }
    public void setAreaAcres(BigDecimal areaAcres) { this.areaAcres = areaAcres; }
    public void setLatitude(BigDecimal latitude) { this.latitude = latitude; }
    public void setLongitude(BigDecimal longitude) { this.longitude = longitude; }
    public void setDescription(String description) { this.description = description; }
    public void setImagePath(String imagePath) { this.imagePath = imagePath; }
    public void setActive(boolean active) { this.active = active; }
}
