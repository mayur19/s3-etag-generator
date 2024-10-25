import CryptoJS from 'crypto-js';

/**
 * Calculates the ETag for a file uploaded to S3 using multipart upload.
 *
 * @param {File} file - The file to calculate the ETag for.
 * @param {number} partSizeMB - The size of each part in megabytes.
 * @param {number} concurrency - The number of parts to process concurrently.
 * @returns {Promise<string>} The calculated ETag in the format "md5-hash-number-of-parts".
 */
async function calculateS3ETag(file: File, partSizeMB: number, concurrency: number = 4): Promise<string> {
    const chunkSize = partSizeMB * 1024 * 1024; // Convert MB to bytes
    const totalChunks = Math.ceil(file.size / chunkSize);
    const partHashes: Uint8Array[] = new Array(totalChunks);

    // Function to process a single chunk and calculate its MD5
    const processChunk = async (index: number): Promise<void> => {
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
    const promises: Promise<void>[] = [];
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
