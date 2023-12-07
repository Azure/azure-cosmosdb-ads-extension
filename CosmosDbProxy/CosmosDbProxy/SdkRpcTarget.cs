namespace Microsoft.Azure.Cosmos.AdsExtensionProxy
{
  using Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel;
  using System;
  using Microsoft.Azure.Cosmos;
  using System.Collections.ObjectModel;

  public class SdkRpcTarget
  {
    private CosmosClient? client;

    // Token dictionary: epoch <--> token
    private Dictionary<long, CancellationTokenSource> cancellationTokenSources = new Dictionary<long, CancellationTokenSource>();

    public SdkRpcTarget()
    {
    }

    // Debugging method that echoes input
    public String Echo(String param)
    {
      return "Received: " + param;
    }

    public void Initialize(Newtonsoft.Json.Linq.JToken paramObject)
    {
      if (paramObject == null)
      {
        throw new ArgumentNullException(nameof(paramObject));
      }

      // TODO handle error
      ConnectPayload connectPayload = paramObject.ToObject<ConnectPayload>();

      if (connectPayload == null)
      {
        throw new Exception("Could not deserialize connect message payload");
      }

      Initialize(connectPayload);
    }
    private void Initialize(ConnectPayload connectPayload)
    {
      client = new CosmosClient(connectPayload.ConnectionString);
    }

    public void Shutdown()
    {
      // Not implemented
    }

    public void CancelToken(Newtonsoft.Json.Linq.JToken paramObject)
    {
      if (paramObject == null)
      {
        throw new ArgumentNullException(nameof(paramObject));
      }

      // TODO handle error
      CancelTokenPayload cancelTokenPayload = paramObject.ToObject<CancelTokenPayload>();

      if (cancelTokenPayload == null)
      {
        throw new Exception("Could not deserialize connect message payload");
      }

      if (cancelTokenPayload.CancelationTokenId != null && cancellationTokenSources.ContainsKey((long)cancelTokenPayload.CancelationTokenId)) {
          CancellationTokenSource cancellationTokenSource = cancellationTokenSources[(long)cancelTokenPayload.CancelationTokenId];
          cancellationTokenSource.Cancel();
        }
    }

    public long GenerateCancelationToken(Newtonsoft.Json.Linq.JToken paramObject)
    {
      CancellationTokenSource cancellationTokenSource = new CancellationTokenSource();
      TimeSpan t = DateTime.Now - new DateTime(1970, 1, 1);
      long msSinceEpoch = (long)t.TotalMilliseconds;
      cancellationTokenSources.Add(msSinceEpoch, cancellationTokenSource);
      return msSinceEpoch;
    }

    public async Task<QueryResponseMessage?> ExecuteQueryNoPaginationAsync(Newtonsoft.Json.Linq.JToken paramObject)
    {
      if (paramObject == null)
      {
        throw new ArgumentNullException(nameof(paramObject));
      }

      // TODO handle error
      QueryPayload queryPayload = paramObject.ToObject<QueryPayload>();

      if (queryPayload == null)
      {
        throw new Exception("Could not deserialize connect message payload");
      }

      return await ExecuteQueryNoPaginationAsync(queryPayload);
    }


    private async Task<QueryResponseMessage?> ExecuteQueryNoPaginationAsync(QueryPayload queryPayload)
    {
      if (client == null)
      {
        // WriteToStdErr("Error: client is not connected. Ignoring message.");
        // TODO Handle error
        return null;
      }

      if (queryPayload == null)
      {
        // WriteToStdErr("Could not deserialize query message payload");
        // TODO Handle error
        return null;

      }

      Database database = client.GetDatabase(id: queryPayload.DatabaseId);

      if (database == null)
      {
        // WriteToStdErr("Database not found: " + queryPayload.DatabaseId);
        // TODO Handle error
        return null;
      }

      Container container = database.GetContainer(queryPayload.ContainerId);

      if (container == null)
      {
        // WriteToStdErr("Container not found: " + queryPayload.ContainerId);
        // TODO Handle error
        return null;
      }

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
      //WriteToStdErr("Finished");
      //responseMessage.RequestId = requestMessage.RequestId;
      //SendResponse(responseMessage);
      return responseMessage;
    }

    public async Task<QueryResponseMessage> ExecuteQueryAsync(Newtonsoft.Json.Linq.JToken paramObject)
    {
      if (paramObject == null)
      {
        throw new ArgumentNullException(nameof(paramObject));
      }

      // TODO handle error
      QueryPayload queryPayload = paramObject.ToObject<QueryPayload>();

      if (queryPayload == null)
      {
        throw new Exception("Could not deserialize connect message payload");
      }

      return await ExecuteQueryAsync(queryPayload);
    }

    public async Task<QueryResponseMessage?> ExecuteQueryAsync(QueryPayload queryPayload)
    {
      if (client == null)
      {
        throw new Exception("Error: client is not connected. Ignoring message.");
      }

      Database database = client.GetDatabase(id: queryPayload.DatabaseId);

      if (database == null)
      {
        //WriteToStdErr("Database not found: " + queryPayload.DatabaseId);
        // TODO Handle error
        return   null;
      }

      Container container = database.GetContainer(queryPayload.ContainerId);

      if (container == null)
      {
        //WriteToStdErr("Container not found: " + queryPayload.ContainerId);
        // TODO Handle error
        return null;
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
      responseMessage.RequestCharge = 0;
      responseMessage.Count = 0;

      // Iterate query result pages
      while (feed.HasMoreResults)
      {
        CancellationToken cancellationToken = default;
        if (queryPayload.CancelationTokenId != null && cancellationTokenSources.ContainsKey((long)queryPayload.CancelationTokenId)) {
          CancellationTokenSource cancellationTokenSource = cancellationTokenSources[(long)queryPayload.CancelationTokenId];
          cancellationToken = cancellationTokenSource.Token;
        }

        try
        {
          FeedResponse<dynamic> response = await feed.ReadNextAsync(cancellationToken);

          // Iterate query results
          foreach (Object item in response)
          {
            //Console.WriteLine($"Found item:\t{item.ToString()}");
            //WriteToStdErr($"Found item:\t{item.ToString()}");
            responseMessage.Documents.Add(item);
          }

          responseMessage.RequestCharge += response.RequestCharge;
          responseMessage.Count += response.Count;

          // Get continuation token once we've gotten > 0 results.
          //if (response.Count > 0)
          if (responseMessage.Documents.Count >= queryPayload.MaxCount)
          {
            responseMessage.ContinuationToken = response.ContinuationToken;
            break;
          }

        }
        catch (CosmosOperationCanceledException ex)
        {
          // Handle this gracefully, user has canceled the query.
          break;
        }
      }
      responseMessage.MaxCount = queryPayload.MaxCount;

      // Deallocate token
      if (queryPayload.CancelationTokenId != null && cancellationTokenSources.ContainsKey((long)queryPayload.CancelationTokenId)) {
        cancellationTokenSources.Remove((long)queryPayload.CancelationTokenId);
      }

      return responseMessage;
    }
  }
}