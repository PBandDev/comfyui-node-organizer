# Validation and Caching (V3)

V3 nodes can optionally validate inputs and provide cache fingerprints to skip re-execution.
These are classmethods and should accept the same named inputs as `execute`.

## validate_inputs

- Return `True` to accept inputs.
- Return a string to surface a user-facing error message.

Example (abbreviated):
```python
@classmethod
def validate_inputs(cls, file):
    if not folder_paths.exists_annotated_filepath(file):
        return f"Invalid file: {file}"
    return True
```

## fingerprint_inputs

- Return a cheap, stable fingerprint for caching.
- If the fingerprint matches the previous run, the node may be skipped.

Example (abbreviated):
```python
@classmethod
def fingerprint_inputs(cls, file):
    path = folder_paths.get_annotated_filepath(file)
    return os.path.getmtime(path)
```

## Usage Notes

- Keep fingerprints fast (avoid hashing large files).
- When `INPUT_IS_LIST` is used, inputs may be wrapped (e.g., `(None,)`).
