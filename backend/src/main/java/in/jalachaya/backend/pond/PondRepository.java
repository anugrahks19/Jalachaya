package in.jalachaya.backend.pond;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PondRepository extends JpaRepository<Pond, Long> {
    List<Pond> findByActiveTrueOrderByNameAsc();
    List<Pond> findAllByOrderByNameAsc();
    Optional<Pond> findByNameIgnoreCaseAndWardIgnoreCase(String name, String ward);
}
