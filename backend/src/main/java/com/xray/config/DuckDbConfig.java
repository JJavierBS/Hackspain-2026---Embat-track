package com.xray.config;

import com.xray.infrastructure.duckdb.DuckDbDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;

@Configuration
public class DuckDbConfig {

    @Bean(destroyMethod = "close")
    public DuckDbDataSource dataSource(XRayProperties props) throws IOException, SQLException {
        Path dir = props.dataPath();
        Files.createDirectories(dir);
        return new DuckDbDataSource("jdbc:duckdb:" + dir.resolve("xray.duckdb"));
    }
}
