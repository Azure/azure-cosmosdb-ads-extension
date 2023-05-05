namespace Microsoft.Azure.Cosmos.AdsExtensionProxy
{
    using Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel;
    using System;
    using Microsoft.Azure.Cosmos;
    using System.Collections.ObjectModel;
    using System.IO;
    using System.ComponentModel;
    using Container = Container;
    using Newtonsoft.Json;

    public class MessageProcessor
    {
        private CosmosClient? client;
        private Stream stdinInputStream = Console.OpenStandardInput();
        private Stream stdoutOutputStream = Console.OpenStandardOutput();
        private bool abort = false;

        public MessageProcessor()
        {
        }

        private void SendResponse<T>(T responseMessage)
        {
            string jsonString = JsonConvert.SerializeObject(responseMessage);
            //string jsonString = JsonSerializer.Serialize(responseMessage);
            //stdoutOutputStream.Write(jsonString);
            WriteToStdErr("responding with (" + jsonString.Length + ")");
            Console.WriteLine(jsonString);
        }

        private void WriteToStdErr(string message)
        {
            Console.Error.WriteLine("Proxy:" + message);
        }

        public async Task Main()
        {
            WriteToStdErr("Listening to messages");

            while (!abort)
            {
                var messageBuffer = new byte[1024];
                int outputLength = stdinInputStream.Read(messageBuffer, 0, 1024);
                char[] chars = System.Text.Encoding.UTF8.GetChars(messageBuffer, 0, outputLength);
                string messageStr = new string(chars);
                WriteToStdErr("message received (" + outputLength + ")");

                // TODO Catch parsing exceptions
                Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel.RequestMessage? requestMessage = JsonConvert.DeserializeObject<Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel.RequestMessage>(messageStr);
                if (requestMessage == null)
                {
                    WriteToStdErr("No message parsed. Skipping this message");
                    break;
                }

                WriteToStdErr("Command: " + requestMessage.Command);
                if (requestMessage.Command == "shutdown")
                {
                    abort = true;
                    CompletedResponseMessage response = new CompletedResponseMessage();
                    response.RequestId = requestMessage.RequestId;
                    SendResponse(response);
                    break;
                }

                if (requestMessage.Command == "initialize")
                {
                    ConnectPayload? connectPayload = requestMessage.Payload.ToObject<ConnectPayload>(); // JsonConvert.DeserializeObject<ConnectPayload>(requestMessage.Payload);
                    if (connectPayload == null)
                    {
                        WriteToStdErr("Payload missing for connect message");
                        break;
                    }

                    client = new CosmosClient(connectPayload.ConnectionString);
                    CompletedResponseMessage response = new CompletedResponseMessage();
                    response.RequestId= requestMessage.RequestId;
                    SendResponse(response);
                }

                if (requestMessage.Command == "executeQueryNoPagination")
                {
                    if (client == null)
                    {
                        WriteToStdErr("Error: client is not connected. Ignoring message.");
                        break;
                    }

                    // TODO Error handling here
                    QueryPayload queryPayload = requestMessage.Payload.ToObject<QueryPayload>();  // JsonConvert.DeserializeObject<QueryPayload>(requestMessage.Payload);
                    if (queryPayload == null)
                    {
                        WriteToStdErr("Could not deserialize query message payload");
                        break;
                    }

                    Database database = client.GetDatabase(id: queryPayload.DatabaseId);

                    if (database == null)
                    {
                        WriteToStdErr("Database not found: " + queryPayload.DatabaseId);
                        break;
                    }

                    Container container = database.GetContainer(queryPayload.ContainerId);

                    if (container == null)
                    {
                        WriteToStdErr("Container not found: " + queryPayload.ContainerId);
                        break;
                    }
                    
                    // TODO Add Paging

                    // Query multiple items from container
                    using FeedIterator<dynamic> feed = container.GetItemQueryIterator<dynamic>(
                        queryText: queryPayload.QueryText
                    );
                    QueryResponseMessage responseMessage = new QueryResponseMessage();
                    responseMessage.Documents = new Collection<dynamic>();

                    // Iterate query result pages
                    while (feed.HasMoreResults)
                    {
                        FeedResponse<dynamic> response = await feed.ReadNextAsync();

                        // Iterate query results
                        foreach (Object item in response)
                        {
                            //Console.WriteLine($"Found item:\t{item.ToString()}");
                            //WriteToStdErr($"Found item:\t{item.ToString()}");
                            responseMessage.Documents.Add(item);
                        }
                    }
                    WriteToStdErr("Finished");
                    responseMessage.RequestId = requestMessage.RequestId;
                    SendResponse(responseMessage);
                }

                if (requestMessage.Command == "executeQuery")
                {
                    if (client == null)
                    {
                        WriteToStdErr("Error: client is not connected. Ignoring message.");
                        break;
                    }

                    // TODO Error handling here
                    QueryPayload queryPayload = requestMessage.Payload.ToObject<QueryPayload>();  // JsonConvert.DeserializeObject<QueryPayload>(requestMessage.Payload);
                    if (queryPayload == null)
                    {
                        WriteToStdErr("Could not deserialize query message payload");
                        break;
                    }

                    Database database = client.GetDatabase(id: queryPayload.DatabaseId);

                    if (database == null)
                    {
                        WriteToStdErr("Database not found: " + queryPayload.DatabaseId);
                        break;
                    }

                    Container container = database.GetContainer(queryPayload.ContainerId);

                    if (container == null)
                    {
                        WriteToStdErr("Container not found: " + queryPayload.ContainerId);
                        break;
                    }

                    // Query multiple items from container
                    using FeedIterator<dynamic> feed = container.GetItemQueryIterator<dynamic>(
                        queryText: queryPayload.QueryText,
                        requestOptions: new QueryRequestOptions()
                        {
                            MaxItemCount = queryPayload.MaxCount
                        },
                        continuationToken: queryPayload.ContinuationToken
                    );
                    QueryResponseMessage responseMessage = new QueryResponseMessage();
                    responseMessage.Documents = new Collection<dynamic>();

                    // Iterate query result pages
                    while (feed.HasMoreResults)
                    {
                        FeedResponse<dynamic> response = await feed.ReadNextAsync();

                        // Iterate query results
                        foreach (Object item in response)
                        {
                            //Console.WriteLine($"Found item:\t{item.ToString()}");
                            //WriteToStdErr($"Found item:\t{item.ToString()}");
                            responseMessage.Documents.Add(item);
                        }

                        // Get continuation token once we've gotten > 0 results. 
                        //if (response.Count > 0)
                        if (responseMessage.Documents.Count > queryPayload.MaxCount)
                        {
                            responseMessage.ContinuationToken = response.ContinuationToken;
                            break;
                        }
                    }
                    WriteToStdErr("Finished");
                    responseMessage.RequestId = requestMessage.RequestId;
                    responseMessage.MaxCount = queryPayload.MaxCount;
                    SendResponse(responseMessage);
                }

                if (requestMessage.Command == "listDatabases")
                {
                    if (client == null)
                    {
                        WriteToStdErr("Error: client is not connected. Ignoring message.");
                        break;
                    }
                    WriteToStdErr("Connecting to Cosmos DB ...");

                    DataModel.DatabaseResponseMessage responseMessage = new DataModel.DatabaseResponseMessage();
                    responseMessage.RequestId = requestMessage.RequestId;
                    responseMessage.Databases = new Collection<DataModel.DatabaseInfo>();

                    using (FeedIterator<DatabaseProperties> iterator = client.GetDatabaseQueryIterator<DatabaseProperties>())
                    {
                        while (iterator.HasMoreResults)
                        {
                            foreach (DatabaseProperties db in await iterator.ReadNextAsync())
                            {
                                DataModel.DatabaseInfo databaseInfo = new DataModel.DatabaseInfo();
                                databaseInfo.Id = db.Id;
                                responseMessage.Databases.Add(databaseInfo);

                                //Console.WriteLine(db.Id);
                                //byte[] bytes = System.Text.Encoding.UTF8.GetBytes(db.Id);
                                //stdoutOutputStream.Write(bytes, 0, bytes.Length);
                            }
                        }
                    }
                    WriteToStdErr("Finished");
                    SendResponse(responseMessage);
                }
            }

            WriteToStdErr("Terminating");   
        }
    }
}