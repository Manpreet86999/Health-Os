import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/** Android 11+ requires a genuinely STORED resources.arsc entry, not level-zero DEFLATE. */
class StoreApkResources {
    public static void main(String[] args) throws Exception {
        if (args.length != 2 || Path.of(args[0]).equals(Path.of(args[1]))) {
            throw new IllegalArgumentException("Provide separate input and output APK paths");
        }
        try (ZipFile input = new ZipFile(args[0]);
             ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(Path.of(args[1])))) {
            var entries = input.entries();
            boolean resources = false;
            while (entries.hasMoreElements()) {
                ZipEntry original = entries.nextElement();
                ZipEntry entry = new ZipEntry(original.getName());
                entry.setTime(original.getTime());
                boolean stored = entry.getName().equals("resources.arsc")
                    || (entry.getName().startsWith("lib/") && entry.getName().endsWith(".so"))
                    || original.getMethod() == ZipEntry.STORED;
                if (entry.getName().equals("resources.arsc")) resources = true;
                if (stored) {
                    entry.setMethod(ZipEntry.STORED);
                    entry.setSize(original.getSize());
                    entry.setCompressedSize(original.getSize());
                    entry.setCrc(original.getCrc());
                }
                output.putNextEntry(entry);
                try (InputStream stream = input.getInputStream(original)) {
                    stream.transferTo(output);
                }
                output.closeEntry();
            }
            if (!resources) throw new IllegalStateException("APK resource table is missing");
        }
    }
}
