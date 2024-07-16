import { BlobServiceClient } from "@azure/storage-blob";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
// Set Azure Blob Storage connection string and container name directly in the code
dotenv.config();
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName =process.env.CONTAINER_NAME;
// Ensure connection string and container name are properly set
if (!AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error("Azure Storage connection string not found in environment variables");
}
if (!containerName) {
    throw new Error("Container name not found in environment variables");
}

// Force connection string and container name to be string type
const connectionString: string = AZURE_STORAGE_CONNECTION_STRING;
const container: string = containerName;

// Set the file path and file name to be uploaded
const filePath = "merged_data.csv"; // Replace with your CSV file path
const blobName = path.basename(filePath);

async function uploadFile() {
    // Create a BlobServiceClient object
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // Create a ContainerClient object
    const containerClient = blobServiceClient.getContainerClient(container);

    // Create the container if it does not exist
    try {
        await containerClient.create();
        console.log(`Container ${container} created successfully`);
    } catch (error: any) { // Explicitly set error type to any
        if (error.statusCode === 409) {
            console.log(`Container ${container} already exists`);
        } else {
            console.error(`Error creating container: ${(error as Error).message}`);
            return;
        }
    }

    // Create a BlobClient object
    const blobClient = containerClient.getBlockBlobClient(blobName);

    // Read the file and upload
    fs.readFile(filePath, async (err, data) => {
        if (err) {
            console.error(`Error reading file: ${err.message}`);
            return;
        }

        try {
            await blobClient.uploadData(data);
            console.log(`File ${blobName} uploaded to container ${container} successfully`);
        } catch (uploadError: any) { // Explicitly set uploadError type to any
            console.error(`Error uploading file: ${(uploadError as Error).message}`);
        }
    });
}

// Call the upload file function
uploadFile().catch((err: any) => { // Explicitly set err type to any
    console.error(`Error in uploadFile function: ${(err as Error).message}`);
});
