package com.xray.application;

/** The request is valid but the server state refuses it (demo mode, a run in progress). HTTP 409. */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
