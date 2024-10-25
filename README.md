

### **Calculate S3 ETag for Large Files on Client-Side Using JavaScript**

#####
This code provides a method to calculate the ETag for large files uploaded to Amazon S3. It implements a concurrent hashing approach, ensuring file integrity by calculating the MD5 checksum of file parts during the upload process. This method can be particularly useful for developers working with large files who want to verify their integrity without downloading the files after upload.

### Code
```javascript
import CryptoJS from 'crypto-js';

/**
 * Calculates the ETag for a file uploaded to S3 using multipart upload.
 *
 * @param {File} file - The file to calculate the ETag for.
 * @param {number} partSizeMB - The size of each part in megabytes.
 * @param {number} concurrency - The number of parts to process concurrently.
 * @returns {Promise<string>} The calculated ETag in the format "md5-hash-number-of-parts".
 */
async function calculateS3ETag(file, partSizeMB, concurrency = 4) {
  const chunkSize = partSizeMB * 1024 * 1024; // Convert MB to bytes
  const totalChunks = Math.ceil(file.size / chunkSize);
  const partHashes = new Array(totalChunks);

  // Function to process a single chunk and calculate its MD5
  const processChunk = async (index) => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);

    const arrayBuffer = await blob.arrayBuffer();
    const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
    const md5Hash = CryptoJS.MD5(wordArray).toString(CryptoJS.enc.Hex);
    
    // Convert the hex hash to a Uint8Array
    const binaryHash = CryptoJS.enc.Hex.parse(md5Hash);
    const byteArray = new Uint8Array(binaryHash.words.length * 4);
    
    for (let i = 0; i < binaryHash.words.length; i++) {
      byteArray.set([
        (binaryHash.words[i] >> 24) & 0xff,
        (binaryHash.words[i] >> 16) & 0xff,
        (binaryHash.words[i] >> 8) & 0xff,
        binaryHash.words[i] & 0xff,
      ], i * 4);
    }
    
    partHashes[index] = byteArray; // Store the Uint8Array for concatenation
  };

  // Create an array of promises to process chunks with limited concurrency
  const promises = [];
  for (let i = 0; i < totalChunks; i++) {
    promises.push(processChunk(i));

    // Control concurrency
    if (promises.length >= concurrency) {
      await Promise.race(promises); // Wait for any promise to resolve
      promises.splice(promises.findIndex(p => p.isFulfilled), 1); // Remove fulfilled promise
    }
  }

  // Wait for remaining promises to resolve
  await Promise.all(promises);

  // Concatenate all part hashes into a single binary array
  const combinedHashes = new Uint8Array(partHashes.reduce((acc, hash) => acc.concat(Array.from(hash)), []));

  // Calculate the MD5 hash of the concatenated binary data
  const combinedMd5 = CryptoJS.MD5(CryptoJS.lib.WordArray.create(combinedHashes)).toString(CryptoJS.enc.Hex);

  // Return the final ETag in the correct format
  return `"${combinedMd5}-${totalChunks}"`; // Final ETag format
}

// Example usage:
// const file = ... // your file input
// const etag = await calculateS3ETag(file, 5, 4); // Use 5 MB part size and 4 concurrent processes
// console.log(etag);
```

### Documentation

#### How to Use

1. **Install CryptoJS**: Make sure to include the CryptoJS library in your project. You can install it via npm:
   ```bash
   npm install crypto-js
   ```

2. **Function Overview**:
   - **`calculateS3ETag`**: This is the main function that calculates the ETag for the specified file.
     - **Parameters**:
       - `file`: The `File` object representing the file you want to upload.
       - `partSizeMB`: The size of each part in megabytes (recommended size is 5 MB).
       - `concurrency`: The number of parts to process concurrently (default is 4).
     - **Returns**: A promise that resolves to the ETag in the format `"md5-hash-number-of-parts"`.

3. **Example**: 
   ```javascript
   // Assume you have a file input element in your HTML
   const fileInput = document.getElementById('fileInput');
   fileInput.addEventListener('change', async (event) => {
     const file = event.target.files[0];
     const etag = await calculateS3ETag(file, 5, 4); // 5 MB part size, 4 concurrent uploads
     console.log('Calculated ETag:', etag);
   });
   ```

### Conclusion
This method will help developers ensure the integrity of large files uploaded to S3 by calculating the correct ETag using client-side JavaScript. If you encounter any issues or have questions, feel free to reach out.

---

You can copy this content into a new gist on GitHub. If you need any further adjustments or additions, just let me know!
